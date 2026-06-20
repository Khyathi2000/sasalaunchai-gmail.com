"""FastAPI entry point for the analysis sidecar.

The TS web app POSTs `{codebase, sid}` to /analyze and consumes the SSE
stream. Events:

    event: state    data: {phase: "ingesting" | "fanning_out" | ...}
    event: report   data: <SpecialistReport JSON> (one per specialist)
    event: analysis data: <RepoAnalysis JSON> (final)
    event: error    data: {message: ...}
    event: done     data: {sid: ..., specialists: <count>}
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException
from sse_starlette.sse import EventSourceResponse

from .graph import run_analysis
from .schema import AnalyzeRequest, RepoAnalysis

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s :: %(message)s")
log = logging.getLogger("analysis-service")

app = FastAPI(title="launch-analysis-service", version="0.1.0")


@app.get("/healthz")
async def healthz() -> dict:
    return {"ok": True}


@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set in sidecar")

    async def stream() -> AsyncIterator[dict]:
        yield {"event": "state", "data": json.dumps({"phase": "ingesting"})}
        try:
            # We currently run the whole graph then emit. Streaming per-
            # specialist events is a follow-up — wrap run_analysis in a
            # task and tap the report list.
            yield {"event": "state", "data": json.dumps({"phase": "fanning_out"})}
            analysis: RepoAnalysis = await run_analysis(req.codebase)
            for r in analysis.specialists:
                yield {"event": "report", "data": r.model_dump_json()}
            yield {"event": "state", "data": json.dumps({"phase": "synthesizing"})}
            yield {"event": "analysis", "data": analysis.model_dump_json()}
            yield {
                "event": "done",
                "data": json.dumps(
                    {
                        "sid": req.sid,
                        "specialists": len(analysis.specialists),
                        "critic_passes": analysis.critic_passes,
                    }
                ),
            }
        except asyncio.CancelledError:
            log.info("client disconnected mid-analysis")
            raise
        except Exception as e:  # noqa: BLE001
            log.exception("analysis failed")
            yield {"event": "error", "data": json.dumps({"message": str(e)})}

    return EventSourceResponse(stream(), ping=15)
