"""Critic: looks at the synthesized analysis + raw specialist reports and
optionally requests a re-run of specific specialists."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from .claude import call_critic, parse_json_object
from .prompts import CRITIC_PROMPT
from .schema import RepoAnalysis, SpecialistName

log = logging.getLogger(__name__)


@dataclass
class CriticVerdict:
    ok: bool
    rerun_specialists: list[SpecialistName]
    notes: str


async def critique(analysis: RepoAnalysis) -> CriticVerdict:
    payload = analysis.model_dump()
    user_msg = (
        "Review this synthesized RepoAnalysis. Use the synthesizer's output and the raw "
        "specialist reports to decide whether the analysis is coherent.\n\n"
        + json.dumps(payload, indent=2)
    )
    result = await call_critic(system_prompt=CRITIC_PROMPT, user_message=user_msg)
    log.info("critic tokens in=%s out=%s", result.input_tokens, result.output_tokens)
    try:
        parsed = parse_json_object(result.text)
    except Exception as e:  # noqa: BLE001
        log.warning("critic json parse failed: %s — assuming ok", e)
        return CriticVerdict(ok=True, rerun_specialists=[], notes="")
    if parsed.get("ok"):
        return CriticVerdict(ok=True, rerun_specialists=[], notes="")
    raw_rerun = parsed.get("rerun_specialists", [])
    valid_names: tuple[SpecialistName, ...] = (
        "frontend", "backend", "api", "database", "storage", "auth", "jobs",
        "ml", "secrets", "scaling", "security",
    )
    rerun: list[SpecialistName] = [n for n in raw_rerun if n in valid_names]
    return CriticVerdict(
        ok=False,
        rerun_specialists=rerun,
        notes=str(parsed.get("notes", ""))[:1000],
    )
