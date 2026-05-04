import Link from "next/link";
import { LandingHeader } from "@/components/LandingHeader";
import { Footer } from "@/components/Footer";
import { BeamGraph } from "@/components/landing/BeamGraph";
import { CloudGrid } from "@/components/landing/CloudGrid";
import { Grain } from "@/components/landing/Grain";
import { Marquee } from "@/components/landing/Marquee";
import { PipelineFlow } from "@/components/landing/PipelineFlow";
import { RevealOnScroll } from "@/components/landing/RevealOnScroll";
import { SectionMarker } from "@/components/landing/SectionMarker";
import { SecuritySection } from "@/components/landing/SecuritySection";
import { SpecialistConstellation } from "@/components/landing/SpecialistConstellation";
import { StatStrip } from "@/components/landing/StatStrip";

export default function Landing() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <Grain />
      <LandingHeader />

      <main className="relative flex-1">
        {/* ==================== HERO ==================== */}
        <section className="relative overflow-hidden">
          {/* Atmospheric backdrop — fine dotted grid */}
          <div className="absolute inset-0 dotted-fine opacity-60" aria-hidden />

          <div className="relative mx-auto w-full max-w-screen-2xl px-8 pb-24 pt-24 xl:px-16 xl:pb-32 xl:pt-32">
            <div className="grid gap-12 xl:grid-cols-[1.05fr_1fr] xl:gap-20">
              {/* LEFT — copy */}
              <div>
                <p className="mb-6 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                  [ multi-cloud deployment platform · v0.1 ]
                </p>
                <h1 className="text-[2.6rem] leading-[1.02] tracking-tight md:text-[3.4rem] xl:text-[4.2rem]">
                  Deploy any codebase
                  <br />
                  <span className="display-serif italic text-[1.05em] text-foreground/70">
                    to any cloud
                  </span>
                  <br />
                  in one click.<span className="caret"></span>
                </h1>
                <p className="mt-8 max-w-xl text-sm leading-relaxed text-foreground/80 md:text-base">
                  Point Launch at a Git URL. Eleven specialist agents read the
                  codebase. The inference engine recommends services. Per-service
                  agents emit Terraform, merge into one stack, apply. AWS or GCP.
                  Production-grade auth — zero secrets at rest.
                </p>

                <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-4">
                  <Link
                    href="/console"
                    className="inline-flex items-center gap-1 border border-ink bg-ink px-8 py-4 text-base uppercase tracking-wider text-cream transition-colors hover:bg-cream hover:text-ink"
                  >
                    <span aria-hidden>[</span>
                    <span className="px-3">launch</span>
                    <span aria-hidden>]</span>
                  </Link>
                  <Link
                    href="#how"
                    className="text-[0.7rem] uppercase tracking-wider text-muted-foreground hover:text-ink"
                  >
                    → see how it works
                  </Link>
                </div>

                <div className="mt-16 grid grid-cols-2 gap-x-8 gap-y-3 text-[0.65rem] uppercase tracking-wider text-muted-foreground sm:flex sm:flex-wrap">
                  <span>
                    <span className="text-foreground">47</span> · agents
                  </span>
                  <span>
                    <span className="text-foreground">2</span> · clouds
                  </span>
                  <span>
                    <span className="text-foreground">1×</span> · tf apply
                  </span>
                  <span>
                    <span className="text-foreground">0</span> · vendor lock-in
                  </span>
                </div>
              </div>

              {/* RIGHT — animated topology */}
              <div className="relative">
                <div className="border border-ink bg-cream/60 p-5 backdrop-blur-sm">
                  <div className="mb-2 flex items-center justify-between text-[0.6rem] uppercase tracking-wider">
                    <span>~/topology</span>
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <span className="inline-block h-1.5 w-1.5 animate-pulse-soft rounded-full bg-ember" />
                      live
                    </span>
                  </div>
                  <BeamGraph />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ==================== STATS ==================== */}
        <RevealOnScroll>
          <section className="hairline">
            <div className="mx-auto w-full max-w-screen-2xl px-8 py-px xl:px-16">
              <StatStrip />
            </div>
          </section>
        </RevealOnScroll>

        {/* ==================== TECH MARQUEE ==================== */}
        <RevealOnScroll>
          <Marquee />
        </RevealOnScroll>

        {/* ==================== PIPELINE ==================== */}
        <section id="how" className="hairline">
          <div className="mx-auto w-full max-w-screen-2xl px-8 py-24 xl:px-16 xl:py-32">
            <RevealOnScroll>
              <header className="mb-12 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
                <div>
                  <SectionMarker fig="02" label="pipeline" />
                  <h2 className="mt-3 text-3xl tracking-tight md:text-4xl xl:text-[2.8rem]">
                    From <span className="display-serif italic">git URL</span> to running cloud,
                    <br />
                    in six observable steps.
                  </h2>
                </div>
                <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
                  Every stage emits a server-sent event so the UI can stream what's happening.
                  Nothing is opaque. Every agent's output is a real artifact you can inspect.
                </p>
              </header>
            </RevealOnScroll>

            <RevealOnScroll delayMs={120}>
              <PipelineFlow />
            </RevealOnScroll>
          </div>
        </section>

        {/* ==================== SPECIALISTS ==================== */}
        <section id="specialists" className="hairline">
          <div className="mx-auto w-full max-w-screen-2xl px-8 py-24 xl:px-16 xl:py-32">
            <RevealOnScroll>
              <header className="mb-12">
                <SectionMarker fig="03" label="analysis crew" />
                <h2 className="mt-3 max-w-3xl text-3xl tracking-tight md:text-4xl xl:text-[2.8rem]">
                  <span className="display-serif italic">Eleven specialists</span>, each watching
                  one dimension of your codebase.
                </h2>
                <p className="mt-6 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  A LangGraph crew runs in parallel — frontend, backend, api, database, storage,
                  auth, jobs, ml, secrets, scaling, security. Findings merge into a single
                  RepoAnalysis; a critic re-runs anyone whose output looks thin.
                </p>
              </header>
            </RevealOnScroll>

            <RevealOnScroll delayMs={120}>
              <SpecialistConstellation />
            </RevealOnScroll>
          </div>
        </section>

        {/* ==================== EDITORIAL PULL QUOTE ==================== */}
        <RevealOnScroll>
          <section className="hairline">
            <div className="mx-auto w-full max-w-screen-2xl px-8 py-24 xl:px-16">
              <blockquote className="mx-auto max-w-4xl text-center">
                <p className="display-serif text-3xl leading-tight tracking-tight md:text-5xl xl:text-6xl">
                  Real Terraform under the hood.
                  <br />
                  <span className="display-serif-italic text-foreground/60">No magic. No lock-in.</span>
                </p>
                <p className="mt-8 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                  every agent emits standard HCL · inspect it · take it with you
                </p>
              </blockquote>
            </div>
          </section>
        </RevealOnScroll>

        {/* ==================== CLOUD COVERAGE ==================== */}
        <section id="services" className="hairline">
          <div className="mx-auto w-full max-w-screen-2xl px-8 py-24 xl:px-16 xl:py-32">
            <RevealOnScroll>
              <header className="mb-12 flex flex-wrap items-end justify-between gap-6">
                <div>
                  <SectionMarker fig="04" label="cloud coverage" />
                  <h2 className="mt-3 text-3xl tracking-tight md:text-4xl xl:text-[2.8rem]">
                    47 service agents.
                    <br />
                    <span className="display-serif italic">One model</span> across both clouds.
                  </h2>
                </div>
                <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                  Need something else? Drop a new agent in{" "}
                  <code className="text-foreground">src/core/agents/agents/</code>.
                  The inference rule is one more file.
                </p>
              </header>
            </RevealOnScroll>

            <RevealOnScroll delayMs={120}>
              <CloudGrid />
            </RevealOnScroll>
          </div>
        </section>

        {/* ==================== SECURITY ==================== */}
        <section id="security" className="hairline">
          <div className="mx-auto w-full max-w-screen-2xl px-8 py-24 xl:px-16 xl:py-32">
            <RevealOnScroll>
              <header className="mb-16">
                <SectionMarker fig="05" label="trust model" />
              </header>
            </RevealOnScroll>

            <RevealOnScroll delayMs={120}>
              <SecuritySection />
            </RevealOnScroll>
          </div>
        </section>

        {/* ==================== CTA ==================== */}
        <section className="hairline">
          <div className="relative mx-auto w-full max-w-screen-2xl px-8 py-32 xl:px-16 xl:py-40">
            {/* Background dotted texture for the closing flourish */}
            <div className="absolute inset-0 dotted-fine opacity-50" aria-hidden />

            <RevealOnScroll>
              <div className="relative text-center">
                <SectionMarker fig="06" label="ready" />
                <h2 className="mx-auto mt-4 max-w-3xl text-4xl tracking-tight md:text-5xl xl:text-6xl">
                  Ship a codebase to the cloud.
                  <br />
                  <span className="display-serif italic">In about thirty seconds.</span>
                  <span className="caret" />
                </h2>
                <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-8">
                  <Link
                    href="/console"
                    className="inline-flex items-center gap-1 border border-ink bg-ink px-12 py-5 text-lg uppercase tracking-wider text-cream transition-colors hover:bg-cream hover:text-ink"
                  >
                    <span aria-hidden>[</span>
                    <span className="px-4">launch</span>
                    <span aria-hidden>]</span>
                  </Link>
                  <Link
                    href="https://github.com/msaiprasad1/sasalaunchai-gmail.com"
                    className="text-[0.7rem] uppercase tracking-wider text-muted-foreground hover:text-ink"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    → read the source on github
                  </Link>
                </div>
                <p className="mt-8 text-[0.6rem] uppercase tracking-wider text-muted-foreground">
                  open source · self-host on cloud run · ~30s to first deploy
                </p>
              </div>
            </RevealOnScroll>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
