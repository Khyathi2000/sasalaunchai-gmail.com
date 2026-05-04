"""Specialist runners. Each one is a thin async function around
`call_specialist` that returns a parsed `SpecialistReport`."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

from .claude import call_specialist, parse_json_object
from .prompts import SPECIALIST_OUTPUT_INSTRUCTIONS, SPECIALIST_PROMPTS
from .schema import Finding, SpecialistName, SpecialistReport

log = logging.getLogger(__name__)

ALL_SPECIALISTS: tuple[SpecialistName, ...] = (
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
)


@dataclass
class SpecialistInput:
    name: SpecialistName
    cached_context: str
    extra_note: str | None = None


def _build_user_message(name: SpecialistName, extra_note: str | None) -> str:
    base = (
        f"Produce your {name} specialist report on the repository above. "
        f"{SPECIALIST_OUTPUT_INSTRUCTIONS}"
    )
    if extra_note:
        base += f"\n\n# Critic note from a prior pass:\n{extra_note}\n"
    return base


def _coerce_report(name: SpecialistName, raw_text: str) -> SpecialistReport:
    """Turn raw model JSON into a validated SpecialistReport. On any
    failure, return an empty stub — the synthesizer + critic will catch
    missing coverage on the next pass."""
    try:
        parsed = parse_json_object(raw_text)
    except Exception as e:  # noqa: BLE001
        log.warning("specialist=%s json parse failed: %s", name, e)
        return SpecialistReport(
            specialist=name,
            summary=f"({name} specialist returned unparseable output)",
            findings=[],
            inferred_services=[],
            confidence=0.0,
            raw=raw_text[:2000],
        )
    # Be tolerant — if the model omitted/renamed `specialist`, force it.
    parsed["specialist"] = name
    parsed.setdefault("findings", [])
    parsed.setdefault("inferred_services", [])
    parsed.setdefault("confidence", 0.5)
    parsed.setdefault("summary", "")
    # Coerce findings into objects if the model returned strings.
    coerced_findings: list[Finding | dict] = []
    for f in parsed["findings"]:
        if isinstance(f, str):
            coerced_findings.append(Finding(title=f[:80], detail=f, severity="info"))
        else:
            coerced_findings.append(f)
    parsed["findings"] = coerced_findings
    try:
        return SpecialistReport.model_validate(parsed)
    except Exception as e:  # noqa: BLE001
        log.warning("specialist=%s schema validation failed: %s", name, e)
        return SpecialistReport(
            specialist=name,
            summary=str(parsed.get("summary", ""))[:500],
            findings=[],
            inferred_services=[],
            confidence=0.0,
            raw=raw_text[:2000],
        )


async def run_specialist(spec: SpecialistInput) -> SpecialistReport:
    """Run one specialist end-to-end."""
    sys_prompt = SPECIALIST_PROMPTS[spec.name]
    user_msg = _build_user_message(spec.name, spec.extra_note)
    result = await call_specialist(
        system_prompt=sys_prompt,
        cached_context=spec.cached_context,
        user_message=user_msg,
    )
    log.info(
        "specialist=%s tokens in=%s out=%s cache_read=%s cache_create=%s",
        spec.name,
        result.input_tokens,
        result.output_tokens,
        result.cache_read_tokens,
        result.cache_create_tokens,
    )
    return _coerce_report(spec.name, result.text)


async def run_all_specialists(
    cached_context: str,
    only: tuple[SpecialistName, ...] | None = None,
    notes: dict[SpecialistName, str] | None = None,
) -> list[SpecialistReport]:
    """Fan out to every specialist in parallel."""
    targets = only if only else ALL_SPECIALISTS
    notes = notes or {}
    tasks = [
        run_specialist(SpecialistInput(name=n, cached_context=cached_context, extra_note=notes.get(n)))
        for n in targets
    ]
    return await asyncio.gather(*tasks)
