"use client";

import { useEffect } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { InputPanel } from "@/components/InputPanel";
import { AnalysisStream } from "@/components/AnalysisStream";
import { ServiceGrid } from "@/components/ServiceGrid";
import { DeployTimeline } from "@/components/DeployTimeline";
import { Dashboard } from "@/components/Dashboard";
import { useStore } from "@/lib/store";

export default function AppPage() {
  const setSid = useStore((s) => s.setSid);
  const setPhase = useStore((s) => s.setPhase);
  const setCodebase = useStore((s) => s.setCodebase);
  const setAnalysis = useStore((s) => s.setAnalysis);
  const setRecommendations = useStore((s) => s.setRecommendations);
  const setPlanId = useStore((s) => s.setPlanId);

  // Resume from ?sid= on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const sid = url.searchParams.get("sid");
    if (!sid) return;

    fetch(`/api/session/${sid}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.session) return;
        const s = data.session;
        setSid(sid);
        if (s.codebase) setCodebase(s.codebase);
        if (s.analysis) setAnalysis(s.analysis);
        if (s.recommendations) setRecommendations(s.recommendations);
        if (s.planId) setPlanId(s.planId);
        if (data.orchestratorLive) {
          setPhase("monitoring");
        } else if (s.planId) {
          setPhase("monitoring"); // historical
        } else if (s.recommendations) {
          setPhase("selecting");
        } else if (s.codebase) {
          setPhase("selecting");
        }
      })
      .catch(() => {
        /* ignore */
      });
  }, [setSid, setPhase, setCodebase, setAnalysis, setRecommendations, setPlanId]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <InputPanel />
        <AnalysisStream />
        <ServiceGrid />
        <DeployTimeline />
        <Dashboard />
      </main>
      <Footer />
    </div>
  );
}
