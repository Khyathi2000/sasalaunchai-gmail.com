"""Synthesizer: collapses 11 specialist reports into a final RepoAnalysis."""

from __future__ import annotations

import json
import logging

from .claude import call_synthesizer, parse_json_object
from .prompts import SYNTHESIZER_PROMPT
from .schema import Finding, InfraRequirements, RepoAnalysis, SpecialistReport

log = logging.getLogger(__name__)


def _fallback_mermaid(repo_name: str) -> str:
    return f"flowchart TD\n  Client[Client]\n  App[{repo_name}]\n  Client --> App"


async def synthesize(repo_name: str, reports: list[SpecialistReport]) -> RepoAnalysis:
    payload = {
        "repo_name": repo_name,
        "specialists": [r.model_dump() for r in reports],
    }
    user_msg = (
        "Synthesize the final RepoAnalysis from the following specialist reports.\n\n"
        + json.dumps(payload, indent=2)
    )
    result = await call_synthesizer(system_prompt=SYNTHESIZER_PROMPT, user_message=user_msg)
    log.info(
        "synthesizer tokens in=%s out=%s",
        result.input_tokens,
        result.output_tokens,
    )
    try:
        parsed = parse_json_object(result.text)
    except Exception as e:  # noqa: BLE001
        log.warning("synthesizer json parse failed: %s", e)
        return RepoAnalysis(
            repo_name=repo_name,
            summary="(synthesizer returned unparseable output)",
            architecture_mermaid=_fallback_mermaid(repo_name),
            specialists=reports,
            cross_cutting_concerns=[],
            infra_requirements=InfraRequirements(),
            confidence=0.0,
        )
    parsed["specialists"] = [r.model_dump() for r in reports]
    # The synthesizer's view of repo_name is not authoritative — the user
    # gave us the canonical name in the request.
    parsed["repo_name"] = repo_name
    parsed.setdefault("architecture_mermaid", _fallback_mermaid(repo_name))
    parsed.setdefault("cross_cutting_concerns", [])
    parsed.setdefault("infra_requirements", {})
    parsed.setdefault("confidence", 0.5)
    # Validate (loose: extras dropped, missing keys defaulted).
    try:
        return RepoAnalysis.model_validate(parsed)
    except Exception as e:  # noqa: BLE001
        log.warning("synthesizer schema validation failed: %s", e)
        # Try to salvage what we can.
        ccc = []
        for f in parsed.get("cross_cutting_concerns", []):
            try:
                ccc.append(Finding.model_validate(f))
            except Exception:  # noqa: BLE001
                pass
        return RepoAnalysis(
            repo_name=repo_name,
            summary=str(parsed.get("summary", ""))[:1000],
            architecture_mermaid=str(parsed.get("architecture_mermaid", _fallback_mermaid(repo_name))),
            specialists=reports,
            cross_cutting_concerns=ccc,
            infra_requirements=InfraRequirements(),
            confidence=0.0,
        )
