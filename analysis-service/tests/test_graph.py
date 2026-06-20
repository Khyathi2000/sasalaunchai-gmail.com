from app.graph import run_analysis
from app.schema import RepoAnalysis


async def test_full_graph_runs_to_completion(fake_claude, sample_codebase):
    analysis = await run_analysis(sample_codebase)
    assert isinstance(analysis, RepoAnalysis)
    assert analysis.repo_name == "demo-repo"
    assert len(analysis.specialists) == 11
    # Synthesizer fixture sets needs_database=True
    assert analysis.infra_requirements.needs_database is True
    assert analysis.infra_requirements.database_engine == "postgres"
    assert analysis.infra_requirements.auth_provider == "clerk"
    assert analysis.architecture_mermaid.startswith("flowchart TD")
    # Critic OK in default fixture means no rerun.
    assert analysis.critic_passes == 1


async def test_graph_reruns_when_critic_flags(fake_claude_with, sample_codebase):
    """Critic returns ok=false once with rerun_specialists=['frontend'], then ok=true."""
    from app import claude as claude_mod
    from .conftest import FakeAnthropic
    import json as _json

    state = {"critic_calls": 0, "frontend_calls": 0}

    def responder(kwargs: dict) -> str:
        sys_field = kwargs.get("system", "")
        sys_text = " ".join(b.get("text", "") for b in sys_field) if isinstance(sys_field, list) else sys_field
        if "CRITIC" in sys_text:
            state["critic_calls"] += 1
            if state["critic_calls"] == 1:
                return _json.dumps({"ok": False, "rerun_specialists": ["frontend"], "notes": "look at SSR"})
            return _json.dumps({"ok": True})
        if "SYNTHESIZER" in sys_text:
            return _json.dumps(
                {
                    "repo_name": "demo-repo",
                    "summary": "x",
                    "architecture_mermaid": "flowchart TD\n  A-->B",
                    "cross_cutting_concerns": [],
                    "infra_requirements": {},
                    "confidence": 0.5,
                }
            )
        if "FRONTEND" in sys_text:
            state["frontend_calls"] += 1
        return _json.dumps(
            {
                "specialist": "frontend" if "FRONTEND" in sys_text else "backend",
                "summary": "",
                "findings": [],
                "inferred_services": [],
                "confidence": 0.5,
            }
        )

    claude_mod._set_client_for_test(FakeAnthropic(responder))  # type: ignore[arg-type]
    analysis = await run_analysis(sample_codebase)
    # First pass = 11 specialist calls; second pass reruns just frontend.
    assert state["frontend_calls"] == 2
    assert state["critic_calls"] == 2
    assert analysis.critic_passes == 2
    claude_mod._set_client_for_test(None)


async def test_critic_pass_capped_at_max(fake_claude_with, sample_codebase):
    """Even if the critic keeps demanding reruns, we stop after MAX_CRITIC_PASSES."""
    from app import claude as claude_mod
    from .conftest import FakeAnthropic
    import json as _json

    def responder(kwargs: dict) -> str:
        sys_field = kwargs.get("system", "")
        sys_text = " ".join(b.get("text", "") for b in sys_field) if isinstance(sys_field, list) else sys_field
        if "CRITIC" in sys_text:
            return _json.dumps({"ok": False, "rerun_specialists": ["frontend"], "notes": "still bad"})
        if "SYNTHESIZER" in sys_text:
            return _json.dumps(
                {
                    "repo_name": "demo-repo",
                    "summary": "x",
                    "architecture_mermaid": "flowchart TD",
                    "cross_cutting_concerns": [],
                    "infra_requirements": {},
                    "confidence": 0.5,
                }
            )
        return _json.dumps(
            {"specialist": "frontend", "summary": "", "findings": [], "inferred_services": [], "confidence": 0.5}
        )

    claude_mod._set_client_for_test(FakeAnthropic(responder))  # type: ignore[arg-type]
    analysis = await run_analysis(sample_codebase)
    # Capped: critic_pass goes 1 then 2 (== MAX), stops emitting reruns.
    assert analysis.critic_passes == 2
    claude_mod._set_client_for_test(None)
