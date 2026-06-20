import Link from "next/link";
import { LandingHeader } from "@/components/LandingHeader";
import { Footer } from "@/components/Footer";

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <LandingHeader />

      <main className="flex-1">
        {/* ========== HERO ========== */}
        <section className="mx-auto w-full max-w-4xl px-6 pb-32 pt-32 md:pt-40 xl:pt-48">
          <h1 className="text-[2.6rem] leading-[1.04] tracking-tight md:text-[4rem] xl:text-[5rem]">
            Deploy any codebase
            <br />
            <span className="display-serif italic text-foreground/70">to any cloud.</span>
          </h1>

          <p className="mt-10 max-w-xl text-base leading-relaxed text-foreground/75 md:text-lg">
            Connect a repository. Launch reads it, picks the right services, and ships
            it to AWS or GCP. No infrastructure work — just one click.
          </p>

          <div className="mt-12 flex items-center gap-6">
            <Link
              href="/console"
              className="inline-flex items-center gap-1 border border-ink bg-ink px-8 py-4 text-base uppercase tracking-wider text-cream transition-colors hover:bg-cream hover:text-ink"
            >
              <span aria-hidden>[</span>
              <span className="px-3">launch</span>
              <span aria-hidden>]</span>
            </Link>
            <Link
              href="/login"
              className="text-[0.7rem] uppercase tracking-wider text-muted-foreground hover:text-ink"
            >
              sign in →
            </Link>
          </div>
        </section>

        {/* ========== VALUE BLOCKS ========== */}
        <section className="border-t border-border">
          <div className="mx-auto grid w-full max-w-6xl gap-px bg-border md:grid-cols-3">
            <ValueBlock
              title="One platform, both clouds."
              body="Same workflow for AWS or GCP. Switch any time. We handle the differences."
            />
            <ValueBlock
              title="Talk to your architecture."
              body="Reshape your deployment in plain English. Add a database. Swap a region. Scale up. Type what you want."
            />
            <ValueBlock
              title="Production-grade by default."
              body="Short-lived credentials. Encrypted vault. Nothing long-lived stored. The audit trail names the platform, not a person."
            />
          </div>
        </section>

        {/* ========== SPOTLIGHT QUOTE ========== */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-4xl px-6 py-32 text-center md:py-40">
            <p className="display-serif text-3xl leading-tight tracking-tight md:text-5xl xl:text-6xl">
              From a git URL
              <br />
              to a <span className="display-serif-italic">running cloud,</span>
              <br />
              in a few minutes.
            </p>
          </div>
        </section>

        {/* ========== HOW (3 short steps) ========== */}
        <section className="border-t border-border">
          <div className="mx-auto w-full max-w-5xl px-6 py-24 md:py-32">
            <p className="mb-12 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              [ how it works ]
            </p>
            <ol className="space-y-12 md:space-y-16">
              <Step
                n="01"
                title="Connect."
                body="Sign in. Paste a repository URL — public or private. Launch reads it end to end."
              />
              <Step
                n="02"
                title="Review."
                body="See a recommended deployment plan with both clouds side by side. Edit it by checking boxes or by chatting with it."
              />
              <Step
                n="03"
                title="Deploy."
                body="Authorize your cloud account once. Click launch. Watch it ship in real time."
              />
            </ol>
          </div>
        </section>

        {/* ========== CLOSING CTA ========== */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-4xl px-6 py-32 text-center md:py-40">
            <h2 className="text-3xl tracking-tight md:text-4xl xl:text-5xl">
              Ship a codebase to the cloud.
              <br />
              <span className="display-serif italic">Today.</span>
            </h2>
            <div className="mt-12">
              <Link
                href="/console"
                className="inline-flex items-center gap-1 border border-ink bg-ink px-12 py-5 text-lg uppercase tracking-wider text-cream transition-colors hover:bg-cream hover:text-ink"
              >
                <span aria-hidden>[</span>
                <span className="px-4">launch</span>
                <span aria-hidden>]</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function ValueBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-cream p-8 md:p-10">
      <h3 className="text-lg tracking-tight md:text-xl">{title}</h3>
      <p className="mt-4 text-sm leading-relaxed text-foreground/70">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="grid gap-4 md:grid-cols-[120px_1fr] md:items-baseline md:gap-12">
      <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
        [ {n} ]
      </span>
      <div>
        <h3 className="display-serif text-2xl tracking-tight md:text-3xl">{title}</h3>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/75 md:text-base">
          {body}
        </p>
      </div>
    </li>
  );
}
