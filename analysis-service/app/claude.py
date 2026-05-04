"""Anthropic API helpers with prompt caching.

Specialist runs share a large prefix (the codebase context). We mark that
prefix as `cache_control: ephemeral` so the second specialist onwards
reads from cache instead of re-billing the full repo. Net effect on a
30-file repo: ~10x cost reduction across the crew.

This module is the ONLY place that talks to the Anthropic SDK directly,
so prompt caching, model selection, and retries can evolve in one place.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Optional

from anthropic import AsyncAnthropic
from anthropic.types import MessageParam

DEFAULT_SPECIALIST_MODEL = os.environ.get("CLAUDE_SPECIALIST_MODEL", "claude-sonnet-4-6")
DEFAULT_SYNTHESIZER_MODEL = os.environ.get("CLAUDE_SYNTHESIZER_MODEL", "claude-opus-4-7")
DEFAULT_CRITIC_MODEL = os.environ.get("CLAUDE_CRITIC_MODEL", "claude-haiku-4-5-20251001")


@dataclass
class CallResult:
    text: str
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int
    cache_create_tokens: int


_client: Optional[AsyncAnthropic] = None


def client() -> AsyncAnthropic:
    """Lazy-construct the Anthropic client. Tests can monkeypatch this."""
    global _client
    if _client is None:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not set")
        _client = AsyncAnthropic(api_key=api_key)
    return _client


def _set_client_for_test(c: AsyncAnthropic | None) -> None:
    """Test-only injection point. Pass None to reset."""
    global _client
    _client = c


def build_codebase_context_block(
    repo_name: str,
    file_tree: list[str],
    tech_stack: list[str],
    files: list[dict],
    max_chars: int = 120_000,
) -> str:
    """Pack the codebase into a single text block we can cache once and
    re-use across all 11 specialists."""
    parts: list[str] = [f"# Repository: {repo_name}", ""]
    parts.append("## Tech stack")
    parts.append(", ".join(tech_stack) if tech_stack else "(none detected)")
    parts.append("")
    parts.append("## File tree (truncated)")
    parts.extend(file_tree[:200])
    parts.append("")
    parts.append("## Key files")

    used = sum(len(p) + 1 for p in parts)
    for f in files:
        path = f.get("path", "?")
        content = f.get("content", "")
        block = f"\n--- {path} ---\n{content}\n"
        if used + len(block) > max_chars:
            parts.append(f"\n[truncated: {len(files) - files.index(f)} more files]")
            break
        parts.append(block)
        used += len(block)
    return "\n".join(parts)


async def call_specialist(
    *,
    system_prompt: str,
    cached_context: str,
    user_message: str,
    model: str = DEFAULT_SPECIALIST_MODEL,
    max_tokens: int = 4096,
) -> CallResult:
    """Run a specialist call. The `cached_context` block is marked for
    ephemeral cache so subsequent specialist calls hit the cache."""
    resp = await client().messages.create(
        model=model,
        max_tokens=max_tokens,
        system=[
            {"type": "text", "text": system_prompt},
            {
                "type": "text",
                "text": cached_context,
                "cache_control": {"type": "ephemeral"},
            },
        ],
        messages=[
            MessageParam(role="user", content=user_message),
        ],
    )
    text = "".join(block.text for block in resp.content if block.type == "text")
    usage = resp.usage
    return CallResult(
        text=text,
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        cache_read_tokens=getattr(usage, "cache_read_input_tokens", 0) or 0,
        cache_create_tokens=getattr(usage, "cache_creation_input_tokens", 0) or 0,
    )


async def call_synthesizer(
    *,
    system_prompt: str,
    user_message: str,
    model: str = DEFAULT_SYNTHESIZER_MODEL,
    max_tokens: int = 8192,
) -> CallResult:
    """Synthesizer runs once per analysis — Opus for max quality."""
    resp = await client().messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system_prompt,
        messages=[MessageParam(role="user", content=user_message)],
    )
    text = "".join(block.text for block in resp.content if block.type == "text")
    return CallResult(
        text=text,
        input_tokens=resp.usage.input_tokens,
        output_tokens=resp.usage.output_tokens,
        cache_read_tokens=0,
        cache_create_tokens=0,
    )


async def call_critic(
    *,
    system_prompt: str,
    user_message: str,
    model: str = DEFAULT_CRITIC_MODEL,
    max_tokens: int = 1024,
) -> CallResult:
    """Critic runs up to 2x — Haiku for cost."""
    resp = await client().messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system_prompt,
        messages=[MessageParam(role="user", content=user_message)],
    )
    text = "".join(block.text for block in resp.content if block.type == "text")
    return CallResult(
        text=text,
        input_tokens=resp.usage.input_tokens,
        output_tokens=resp.usage.output_tokens,
        cache_read_tokens=0,
        cache_create_tokens=0,
    )


def strip_json_fence(text: str) -> str:
    """Models occasionally wrap JSON in ```json fences. Strip cleanly."""
    s = text.strip()
    if s.startswith("```"):
        # Find first newline after the fence and last ``` to slice
        lines = s.split("\n")
        # Drop the opening fence line
        lines = lines[1:]
        # Drop the closing fence
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        s = "\n".join(lines)
    return s.strip()


def parse_json_object(text: str) -> dict:
    """Best-effort parse of a JSON object from model text. Strips fences,
    falls back to slicing the first `{...}` block."""
    s = strip_json_fence(text)
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        # Find first { and last }
        start = s.find("{")
        end = s.rfind("}")
        if start >= 0 and end > start:
            return json.loads(s[start : end + 1])
        raise
