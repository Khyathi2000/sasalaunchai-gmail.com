# launch-analysis-service

Python sidecar that runs a LangGraph crew of 11 specialist agents over a parsed codebase
and produces a structured `RepoAnalysis`. Called by the Next.js web app's `/api/analyze`
route via SSE.

## Local dev

```bash
cd analysis-service
python -m venv .venv && source .venv/bin/activate   # or .\.venv\Scripts\activate on Windows
pip install -e ".[dev]"
export ANTHROPIC_API_KEY=sk-ant-...
uvicorn app.main:app --port 8001 --reload
```

In another terminal:

```bash
curl -N -X POST http://localhost:8001/analyze \
  -H 'Content-Type: application/json' \
  -d '{"codebase": {"repoName": "demo", "files": [], "techStack": [], "fileTree": [], "totalFiles": 0}}'
```

## Tests

```bash
pytest -q
```

All tests use a fake Anthropic client (see `tests/conftest.py`) so no API key or network is
required for CI.

## Architecture

```
ingest → fan_out_specialists ──┐
              ▲                ▼
              │            synthesize
              │                ▼
              └── critique ────┤  (max 2 passes)
                              END
```

11 specialists (frontend, backend, api, database, storage, auth, jobs, ml, secrets, scaling,
security) run in parallel, each producing a typed `SpecialistReport`. The synthesizer (Claude
Opus) merges them into the final `RepoAnalysis` plus a Mermaid architecture diagram. The
critic (Claude Haiku) reviews; if it flags missing coverage, the targeted specialists rerun
with the critic's note appended. We cap critic-driven reruns at 2.

## Models

- `claude-sonnet-4-6` — specialists (override with `CLAUDE_SPECIALIST_MODEL`)
- `claude-opus-4-7` — synthesizer (override with `CLAUDE_SYNTHESIZER_MODEL`)
- `claude-haiku-4-5-20251001` — critic (override with `CLAUDE_CRITIC_MODEL`)

The codebase context block is sent once per specialist call but with `cache_control:
ephemeral` so the second specialist onwards reads from the prompt cache (~10x cost reduction
on a typical 30-file repo).
