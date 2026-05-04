"""Pydantic contract between the analysis sidecar and the TS web app.

Anything this module emits (`RepoAnalysis`) is what the Next.js side
deserializes into its `AnalysisResult` type. Keep field names and shapes
stable; mark new fields as Optional with safe defaults to preserve forward
compatibility.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

Severity = Literal["info", "note", "concern"]
RuntimeKind = Literal["container", "serverless", "vm", "mixed", "static"]
SpecialistName = Literal[
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
]


class Finding(BaseModel):
    """One observation from a specialist or the synthesizer."""

    model_config = ConfigDict(extra="ignore")

    title: str
    detail: str
    files: list[str] = Field(default_factory=list)
    severity: Severity = "info"


class SpecialistReport(BaseModel):
    """One specialist's structured output."""

    model_config = ConfigDict(extra="ignore")

    specialist: SpecialistName
    summary: str
    findings: list[Finding] = Field(default_factory=list)
    inferred_services: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)
    raw: Optional[str] = None  # original model text for debugging / replay


class InfraRequirements(BaseModel):
    """Synthesizer's structured infrastructure profile."""

    model_config = ConfigDict(extra="ignore")

    runtime: RuntimeKind = "container"
    needs_database: bool = False
    database_engine: Optional[str] = None
    needs_object_storage: bool = False
    needs_cache: bool = False
    needs_message_queue: bool = False
    needs_background_workers: bool = False
    needs_ml_inference: bool = False
    needs_ml_training: bool = False
    has_websocket: bool = False
    has_long_running_requests: bool = False
    auth_provider: Optional[str] = None
    estimated_qps: Optional[int] = None
    scaling_min: int = 0
    scaling_max: int = 10
    sensitive_env_vars: list[str] = Field(default_factory=list)


class RepoAnalysis(BaseModel):
    """Top-level result returned by the sidecar."""

    model_config = ConfigDict(extra="ignore")

    repo_name: str
    summary: str
    architecture_mermaid: str
    specialists: list[SpecialistReport] = Field(default_factory=list)
    cross_cutting_concerns: list[Finding] = Field(default_factory=list)
    infra_requirements: InfraRequirements = Field(default_factory=InfraRequirements)
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)
    critic_passes: int = 0


# Inputs from the TS side ---------------------------------------------------


class CodebaseFile(BaseModel):
    """One parsed file shipped from the TS parser."""

    model_config = ConfigDict(extra="ignore")

    path: str
    content: str
    language: Optional[str] = None
    size: Optional[int] = None


class ParsedCodebase(BaseModel):
    """Subset of the TS `ParsedCodebase` we need on the Python side."""

    model_config = ConfigDict(extra="ignore")

    repoName: str  # noqa: N815 — matches TS camelCase wire format
    repoUrl: Optional[str] = None
    defaultBranch: Optional[str] = None  # noqa: N815
    files: list[CodebaseFile] = Field(default_factory=list)
    techStack: list[str] = Field(default_factory=list)  # noqa: N815
    fileTree: list[str] = Field(default_factory=list)  # noqa: N815
    totalFiles: int = 0  # noqa: N815
    packageJson: Optional[dict] = None  # noqa: N815


class AnalyzeRequest(BaseModel):
    codebase: ParsedCodebase
    sid: Optional[str] = None
