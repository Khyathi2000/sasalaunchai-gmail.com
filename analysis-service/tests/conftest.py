"""Test fixtures: a fake Anthropic client that returns canned responses
keyed off the system-prompt prefix. Lets us exercise the LangGraph and
specialist orchestration without any network calls or real API keys."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Callable

import pytest

from app import claude as claude_mod


@dataclass
class FakeUsage:
    input_tokens: int = 100
    output_tokens: int = 200
    cache_read_input_tokens: int = 0
    cache_creation_input_tokens: int = 0


@dataclass
class FakeBlock:
    type: str
    text: str


@dataclass
class FakeResponse:
    content: list[FakeBlock]
    usage: FakeUsage


class FakeMessages:
    def __init__(self, responder: Callable[[dict], str]):
        self._responder = responder

    async def create(self, **kwargs: Any) -> FakeResponse:
        text = self._responder(kwargs)
        return FakeResponse(content=[FakeBlock(type="text", text=text)], usage=FakeUsage())


class FakeAnthropic:
    def __init__(self, responder: Callable[[dict], str]):
        self.messages = FakeMessages(responder)


def specialist_responder(extra: dict[str, dict] | None = None) -> Callable[[dict], str]:
    """Returns a responder that yields a canned JSON SpecialistReport
    based on the specialist name detected in the user message."""
    extra = extra or {}

    def responder(kwargs: dict) -> str:
        # System content can be a string OR a list of blocks (when caching).
        sys_field = kwargs.get("system", "")
        if isinstance(sys_field, list):
            sys_text = " ".join(b.get("text", "") for b in sys_field)
        else:
            sys_text = sys_field
        msgs = kwargs["messages"]
        user_text = msgs[0]["content"]
        # Synthesizer call?
        if "SYNTHESIZER" in sys_text:
            return json.dumps(
                {
                    "repo_name": "test-repo",
                    "summary": "Synth summary",
                    "architecture_mermaid": "flowchart TD\n  A --> B",
                    "cross_cutting_concerns": [],
                    "infra_requirements": {
                        "runtime": "container",
                        "needs_database": True,
                        "database_engine": "postgres",
                        "needs_object_storage": False,
                        "needs_cache": False,
                        "needs_message_queue": False,
                        "needs_background_workers": False,
                        "needs_ml_inference": False,
                        "needs_ml_training": False,
                        "has_websocket": False,
                        "has_long_running_requests": False,
                        "auth_provider": "clerk",
                        "estimated_qps": None,
                        "scaling_min": 1,
                        "scaling_max": 10,
                        "sensitive_env_vars": ["DATABASE_URL"],
                    },
                    "confidence": 0.9,
                }
            )
        # Critic call?
        if "CRITIC" in sys_text:
            return json.dumps({"ok": True})
        # Specialist call — figure out which one from the prompt.
        for name in [
            "frontend",
            "backend",
            "api",
            "database",
            "storage",
            "auth",
            "jobs",
            "ml",
            "secrets",
            "scaling",
            "security",
        ]:
            if name.upper() in sys_text:
                custom = extra.get(name, {})
                return json.dumps(
                    {
                        "specialist": name,
                        "summary": custom.get("summary", f"{name} stub summary"),
                        "findings": custom.get("findings", []),
                        "inferred_services": custom.get("inferred_services", []),
                        "confidence": custom.get("confidence", 0.7),
                    }
                )
        # Unknown call — return empty.
        return json.dumps({"specialist": "unknown", "summary": "", "findings": [], "inferred_services": [], "confidence": 0.0})

    return responder


@pytest.fixture
def fake_claude():
    """Install a fake AsyncAnthropic for the duration of one test."""
    fake = FakeAnthropic(specialist_responder())
    claude_mod._set_client_for_test(fake)  # type: ignore[arg-type]
    yield fake
    claude_mod._set_client_for_test(None)


@pytest.fixture
def fake_claude_with(monkeypatch):
    """Customizable variant: returns a callable that installs a fake with
    per-specialist overrides."""

    def install(extra: dict[str, dict]):
        fake = FakeAnthropic(specialist_responder(extra))
        claude_mod._set_client_for_test(fake)  # type: ignore[arg-type]
        return fake

    yield install
    claude_mod._set_client_for_test(None)


@pytest.fixture
def sample_codebase():
    from app.schema import CodebaseFile, ParsedCodebase

    return ParsedCodebase(
        repoName="demo-repo",
        repoUrl="https://github.com/demo/demo-repo",
        defaultBranch="main",
        techStack=["nextjs", "react", "prisma", "postgres"],
        fileTree=["package.json", "app/page.tsx", "prisma/schema.prisma", ".env.example"],
        totalFiles=4,
        files=[
            CodebaseFile(path="package.json", content='{"name":"demo","dependencies":{"next":"^15.0.0","prisma":"^5.0.0"}}'),
            CodebaseFile(path="prisma/schema.prisma", content="model User { id Int @id }"),
            CodebaseFile(path="app/page.tsx", content="export default function Home() { return <div /> }"),
            CodebaseFile(path=".env.example", content="DATABASE_URL=\nNEXT_PUBLIC_API=\n"),
        ],
        packageJson={"name": "demo", "dependencies": {"next": "^15.0.0", "prisma": "^5.0.0"}},
    )
