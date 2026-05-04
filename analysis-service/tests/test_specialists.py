from app.schema import SpecialistReport
from app.specialists import ALL_SPECIALISTS, run_all_specialists, run_specialist, SpecialistInput


async def test_run_specialist_returns_validated_report(fake_claude):
    rep = await run_specialist(SpecialistInput(name="frontend", cached_context="ctx"))
    assert isinstance(rep, SpecialistReport)
    assert rep.specialist == "frontend"
    assert rep.confidence == 0.7


async def test_run_all_specialists_runs_eleven(fake_claude):
    reports = await run_all_specialists(cached_context="ctx")
    assert len(reports) == len(ALL_SPECIALISTS) == 11
    names = {r.specialist for r in reports}
    assert names == set(ALL_SPECIALISTS)


async def test_unparseable_output_yields_empty_report(fake_claude_with):
    # responder returns malformed JSON for one specialist — code should not crash.
    from app import claude as claude_mod
    from .conftest import FakeAnthropic

    def bad_responder(kwargs: dict) -> str:
        sys_field = kwargs.get("system", "")
        sys_text = " ".join(b.get("text", "") for b in sys_field) if isinstance(sys_field, list) else sys_field
        if "FRONTEND" in sys_text:
            return "this is not json at all"
        return '{"specialist":"x","summary":"","findings":[],"inferred_services":[],"confidence":0.0}'

    claude_mod._set_client_for_test(FakeAnthropic(bad_responder))  # type: ignore[arg-type]
    rep = await run_specialist(SpecialistInput(name="frontend", cached_context="ctx"))
    assert rep.specialist == "frontend"
    assert rep.confidence == 0.0
    assert rep.raw is not None
    claude_mod._set_client_for_test(None)


async def test_specialist_uses_extra_note_on_rerun(fake_claude_with):
    """The critic note should be included in the user message when re-running."""
    seen_messages: list[str] = []
    from app import claude as claude_mod
    from .conftest import FakeAnthropic

    def capture_responder(kwargs: dict) -> str:
        seen_messages.append(kwargs["messages"][0]["content"])
        return '{"specialist":"frontend","summary":"x","findings":[],"inferred_services":[],"confidence":0.5}'

    claude_mod._set_client_for_test(FakeAnthropic(capture_responder))  # type: ignore[arg-type]
    await run_specialist(
        SpecialistInput(name="frontend", cached_context="ctx", extra_note="look harder at SSR"),
    )
    assert any("look harder at SSR" in m for m in seen_messages)
    claude_mod._set_client_for_test(None)
