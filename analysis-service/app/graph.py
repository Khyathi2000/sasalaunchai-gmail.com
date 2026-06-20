"""LangGraph state machine for the analysis crew.

Topology:

    ingest → fan_out_specialists → synthesize → critique
                  ▲                                  │
                  └────── rerun (capped at 2) ───────┘

The graph runs sequentially node-by-node; the parallel fan-out happens
inside the `fan_out_specialists` node via asyncio.gather.
"""

from __future__ import annotations

import logging
from typing import TypedDict

from langgraph.graph import END, StateGraph

from .claude import build_codebase_context_block
from .critic import critique
from .schema import (
    ParsedCodebase,
    RepoAnalysis,
    SpecialistName,
    SpecialistReport,
)
from .specialists import ALL_SPECIALISTS, run_all_specialists
from .synthesizer import synthesize

log = logging.getLogger(__name__)
MAX_CRITIC_PASSES = 2


class AnalysisState(TypedDict, total=False):
    codebase: ParsedCodebase
    cached_context: str
    reports: list[SpecialistReport]
    analysis: RepoAnalysis
    critic_pass: int
    rerun_targets: list[SpecialistName]
    rerun_notes: dict[SpecialistName, str]


# Node implementations -----------------------------------------------------


async def ingest_node(state: AnalysisState) -> AnalysisState:
    cb = state["codebase"]
    ctx = build_codebase_context_block(
        repo_name=cb.repoName,
        file_tree=list(cb.fileTree),
        tech_stack=list(cb.techStack),
        files=[f.model_dump() for f in cb.files],
    )
    return {
        "cached_context": ctx,
        "critic_pass": 0,
        "rerun_targets": [],
        "rerun_notes": {},
        "reports": [],
    }


async def fan_out_specialists_node(state: AnalysisState) -> AnalysisState:
    targets = state.get("rerun_targets") or list(ALL_SPECIALISTS)
    notes = state.get("rerun_notes") or {}
    new_reports = await run_all_specialists(
        cached_context=state["cached_context"],
        only=tuple(targets),
        notes=notes,
    )
    # Merge with prior reports (keeping the freshest per specialist).
    by_name: dict[str, SpecialistReport] = {r.specialist: r for r in state.get("reports", [])}
    for r in new_reports:
        by_name[r.specialist] = r
    return {"reports": list(by_name.values())}


async def synthesize_node(state: AnalysisState) -> AnalysisState:
    cb = state["codebase"]
    analysis = await synthesize(cb.repoName, state["reports"])
    return {"analysis": analysis}


async def critic_node(state: AnalysisState) -> AnalysisState:
    pass_no = state.get("critic_pass", 0) + 1
    analysis = state["analysis"]
    analysis.critic_passes = pass_no
    verdict = await critique(analysis)
    if verdict.ok or not verdict.rerun_specialists:
        return {"critic_pass": pass_no, "rerun_targets": [], "analysis": analysis}
    # Cap reruns at MAX_CRITIC_PASSES — we still consume the critique on
    # the cap pass so the verdict is recorded, but we don't fan out again.
    if pass_no >= MAX_CRITIC_PASSES:
        return {"critic_pass": pass_no, "rerun_targets": [], "analysis": analysis}
    notes = {n: verdict.notes for n in verdict.rerun_specialists}
    return {
        "critic_pass": pass_no,
        "rerun_targets": verdict.rerun_specialists,
        "rerun_notes": notes,
        "analysis": analysis,
    }


def should_rerun(state: AnalysisState) -> str:
    if state.get("rerun_targets"):
        return "fan_out"
    return "end"


# Graph builder ------------------------------------------------------------


def build_graph():
    graph = StateGraph(AnalysisState)
    graph.add_node("ingest", ingest_node)
    graph.add_node("fan_out", fan_out_specialists_node)
    graph.add_node("synthesize", synthesize_node)
    graph.add_node("critique", critic_node)

    graph.set_entry_point("ingest")
    graph.add_edge("ingest", "fan_out")
    graph.add_edge("fan_out", "synthesize")
    graph.add_edge("synthesize", "critique")
    graph.add_conditional_edges(
        "critique",
        should_rerun,
        {"fan_out": "fan_out", "end": END},
    )
    return graph.compile()


async def run_analysis(codebase: ParsedCodebase) -> RepoAnalysis:
    """Top-level entry point. Compiles the graph and runs it once."""
    graph = build_graph()
    final_state: AnalysisState = await graph.ainvoke({"codebase": codebase})
    return final_state["analysis"]
