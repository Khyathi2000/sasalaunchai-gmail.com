"use client";

import { create } from "zustand";
import type {
  ParsedCodebase,
  AnalysisResult,
  ServiceRecommendation,
  CostBreakdown,
  ServiceMetrics,
  LifecycleState,
} from "./core.js";

export type Phase =
  | "input"
  | "analyzing"
  | "selecting"
  | "deploying"
  | "monitoring";

export interface AgentTimelineEntry {
  agentId: string;
  serviceId: string;
  status: string;
  message?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

interface SessionState {
  sid: string | null;
  phase: Phase;
  source: string | null;
  codebase: ParsedCodebase | null;
  analysisStreamText: string;
  analysis: AnalysisResult | null;
  recommendations: ServiceRecommendation[];
  selections: Record<string, boolean>;
  provider: "aws" | "gcp";
  region: string;
  applyMode: boolean;
  planId: string | null;
  agents: Record<string, AgentTimelineEntry>;
  lifecycle: Record<string, LifecycleState>;
  cost: CostBreakdown | null;
  costHistory: { t: number; daily: number; monthly: number }[];
  metrics: Record<string, ServiceMetrics>;
  credentialBanner: { aws?: string; gcp?: string };

  setSid: (sid: string) => void;
  setPhase: (phase: Phase) => void;
  setSource: (source: string) => void;
  setCodebase: (cb: ParsedCodebase) => void;
  appendAnalysisChunk: (chunk: string) => void;
  setAnalysis: (a: AnalysisResult) => void;
  setRecommendations: (recs: ServiceRecommendation[]) => void;
  toggleSelection: (serviceId: string) => void;
  setSelection: (serviceId: string, on: boolean) => void;
  setAllSelected: (on: boolean) => void;
  setProvider: (p: "aws" | "gcp") => void;
  setRegion: (r: string) => void;
  setApplyMode: (b: boolean) => void;
  setPlanId: (id: string) => void;
  upsertAgent: (entry: Partial<AgentTimelineEntry> & { agentId: string }) => void;
  setLifecycle: (serviceId: string, state: LifecycleState) => void;
  setCost: (c: CostBreakdown) => void;
  pushCostPoint: (p: { daily: number; monthly: number }) => void;
  setMetrics: (serviceId: string, m: ServiceMetrics) => void;
  setCredentialBanner: (b: { aws?: string; gcp?: string }) => void;
  reset: () => void;
}

const DEFAULT_STATE = {
  sid: null,
  phase: "input" as Phase,
  source: null,
  codebase: null,
  analysisStreamText: "",
  analysis: null,
  recommendations: [],
  selections: {},
  provider: "aws" as const,
  region: "us-east-1",
  applyMode: false,
  planId: null,
  agents: {},
  lifecycle: {},
  cost: null,
  costHistory: [],
  metrics: {},
  credentialBanner: {},
};

export const useStore = create<SessionState>((set) => ({
  ...DEFAULT_STATE,

  setSid: (sid) => set({ sid }),
  setPhase: (phase) => set({ phase }),
  setSource: (source) => set({ source }),
  setCodebase: (codebase) => set({ codebase }),
  appendAnalysisChunk: (chunk) =>
    set((s) => ({ analysisStreamText: s.analysisStreamText + chunk })),
  setAnalysis: (analysis) => set({ analysis }),
  setRecommendations: (recommendations) =>
    set({
      recommendations,
      selections: Object.fromEntries(recommendations.map((r) => [r.serviceId, true])),
    }),
  toggleSelection: (serviceId) =>
    set((s) => ({ selections: { ...s.selections, [serviceId]: !s.selections[serviceId] } })),
  setSelection: (serviceId, on) =>
    set((s) => ({ selections: { ...s.selections, [serviceId]: on } })),
  setAllSelected: (on) =>
    set((s) => ({
      selections: Object.fromEntries(s.recommendations.map((r) => [r.serviceId, on])),
    })),
  setProvider: (provider) => set({ provider }),
  setRegion: (region) => set({ region }),
  setApplyMode: (applyMode) => set({ applyMode }),
  setPlanId: (planId) => set({ planId }),
  upsertAgent: (entry) =>
    set((s) => ({
      agents: {
        ...s.agents,
        [entry.agentId]: { ...(s.agents[entry.agentId] ?? { agentId: entry.agentId, serviceId: entry.agentId, status: "idle" }), ...entry },
      },
    })),
  setLifecycle: (serviceId, state) =>
    set((s) => ({ lifecycle: { ...s.lifecycle, [serviceId]: state } })),
  setCost: (cost) => set({ cost }),
  pushCostPoint: (p) =>
    set((s) => ({
      costHistory: [...s.costHistory.slice(-119), { t: Date.now(), ...p }],
    })),
  setMetrics: (serviceId, m) =>
    set((s) => ({ metrics: { ...s.metrics, [serviceId]: m } })),
  setCredentialBanner: (credentialBanner) => set({ credentialBanner }),
  reset: () => set(DEFAULT_STATE),
}));

export function selectedServiceIds(s: SessionState): string[] {
  return s.recommendations
    .filter((r) => s.selections[r.serviceId])
    .map((r) => r.serviceId);
}
