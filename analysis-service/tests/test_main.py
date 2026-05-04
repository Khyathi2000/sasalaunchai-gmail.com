import json
import os

from fastapi.testclient import TestClient

from app.main import app


def test_healthz():
    client = TestClient(app)
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_analyze_requires_api_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    client = TestClient(app)
    r = client.post(
        "/analyze",
        json={
            "codebase": {
                "repoName": "x",
                "files": [],
                "techStack": [],
                "fileTree": [],
                "totalFiles": 0,
            },
        },
    )
    assert r.status_code == 500
    assert "ANTHROPIC_API_KEY" in r.json()["detail"]


def test_analyze_streams_events(fake_claude, monkeypatch, sample_codebase):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    client = TestClient(app)
    body = {"codebase": sample_codebase.model_dump(), "sid": "sid-test"}
    with client.stream("POST", "/analyze", json=body) as resp:
        assert resp.status_code == 200
        events: list[tuple[str, str]] = []
        current_event = "message"
        current_data: list[str] = []
        for line in resp.iter_lines():
            if not line:
                if current_data:
                    events.append((current_event, "\n".join(current_data)))
                current_event = "message"
                current_data = []
                continue
            if line.startswith("event:"):
                current_event = line[len("event:") :].strip()
            elif line.startswith("data:"):
                current_data.append(line[len("data:") :].strip())
        if current_data:
            events.append((current_event, "\n".join(current_data)))
    event_types = [e[0] for e in events]
    assert "state" in event_types
    assert event_types.count("report") == 11
    assert "analysis" in event_types
    assert "done" in event_types

    # The final analysis event should parse to a valid RepoAnalysis JSON.
    final = next(d for e, d in events if e == "analysis")
    obj = json.loads(final)
    assert obj["repo_name"] == "demo-repo"
    assert len(obj["specialists"]) == 11
