import Link from "next/link";
import { LandingHeader } from "@/components/LandingHeader";
import { Footer } from "@/components/Footer";

const AWS_BRACKETS = [
  "VPC", "IAM", "EC2", "ECS", "LAMBDA", "RDS", "S3", "CLOUDFRONT", "ELASTICACHE",
  "SQS", "ALB", "ROUTE53", "ECR", "CLOUDWATCH", "SECRETS-MANAGER", "DYNAMODB",
  "API-GATEWAY", "COGNITO", "EVENTBRIDGE", "APP-RUNNER", "OPENSEARCH", "STEP-FUNCTIONS",
];

const GCP_BRACKETS = [
  "VPC", "IAM", "CLOUD-RUN", "CLOUD-FUNCTIONS", "GCE", "CLOUD-SQL", "FIRESTORE",
  "GCS", "CLOUD-CDN", "CLOUD-LB", "MEMORYSTORE", "PUB/SUB", "ARTIFACT-REGISTRY",
  "SECRET-MANAGER", "CLOUD-MONITORING", "CLOUD-BUILD", "BIGQUERY", "GKE",
  "VERTEX-AI", "CLOUD-TASKS", "CLOUD-WORKFLOWS",
];

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader />

      <main className="flex-1">
        {/* HERO */}
        <section className="mx-auto w-full max-w-screen-2xl px-8 pb-16 pt-24 xl:px-16 xl:pt-32">
          <div className="grid gap-12 xl:grid-cols-[1.1fr_1fr] xl:gap-24">
            <div>
              <p className="mb-6 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                [ multi-cloud deploy platform ]
              </p>
              <h1 className="text-4xl leading-[1.05] tracking-tight md:text-5xl xl:text-6xl">
                Deploy any codebase.
                <br />
                <span className="text-muted-foreground">To any cloud.</span>
                <br />
                In one click.<span className="caret"></span>
              </h1>
              <p className="mt-8 max-w-xl text-sm leading-relaxed text-foreground/80 md:text-base">
                Point Launch at a Git URL. Agents read the codebase. The inference
                engine recommends services. Per-service agents generate Terraform,
                merge into one stack, and apply. AWS or GCP. Local-first, open source.
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
                <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                  → sign in with github
                </span>
              </div>

              <div className="mt-16 flex flex-wrap gap-x-8 gap-y-3 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                <span><span className="text-foreground">43</span> · cloud agents</span>
                <span><span className="text-foreground">2</span> · clouds (aws · gcp)</span>
                <span><span className="text-foreground">1</span> · click to apply</span>
                <span><span className="text-foreground">0</span> · vendor lock-in</span>
              </div>
            </div>

            {/* Terminal-style preview panel */}
            <div className="border border-ink">
              <div className="flex items-center justify-between border-b border-ink px-3 py-1.5 text-[0.6rem] uppercase tracking-wider">
                <span>~/codebase</span>
                <span className="text-muted-foreground">streaming</span>
              </div>
              <pre className="overflow-x-auto p-4 text-[0.7rem] leading-relaxed">
{`$ launch https://github.com/me/myapp

[ parse        ] 124 files · next.js · prisma · stripe
[ analyze      ] streaming claude · 12s
[ infer        ] 8 services recommended
                 [X] vpc          [X] alb
                 [X] ecs-fargate  [X] rds-postgres
                 [X] ecr          [X] cloudwatch
                 [X] secrets-mgr  [X] route53

[ plan         ] est. $4.62 / day · $138.60 / mo
[ deploy → aws / us-east-1 ]

  vpc-agent           ●  done · 15s
  iam-agent           ●  done · 4s
  ecr-agent           ●  done · 8s
  rds-agent           ●  done · 4m 22s
  ecs-agent           ●  done · 1m 11s
  alb-agent           ●  done · 12s
  cloudwatch-agent    ●  done · 6s
  secrets-mgr-agent   ●  done · 3s
  route53-agent       ●  done · 1s

[ live ]   https://myapp-alb-xxxx.us-east-1.elb.amazonaws.com
`}
              </pre>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how" className="hairline">
          <div className="mx-auto w-full max-w-screen-2xl px-8 py-24 xl:px-16">
            <p className="mb-2 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              [ how it works ]
            </p>
            <h2 className="mb-12 text-2xl tracking-tight md:text-3xl">
              From git URL to running cloud in five steps.
            </h2>
            <div className="grid gap-px bg-border md:grid-cols-5">
              <Step n="01" name="ingest"   body="Clone or scan. Parse package.json, file tree, tech stack." />
              <Step n="02" name="analyze"  body="Claude streams a Mermaid map, file roles, infra requirements." />
              <Step n="03" name="infer"    body="Rule engine + LLM refinement recommends services with confidence." />
              <Step n="04" name="plan"     body="Pick services. Pick provider/region. Apply mode on or off." />
              <Step n="05" name="deploy"   body="One terraform apply across the merged stack. Live logs. Cost dashboard." />
            </div>
          </div>
        </section>

        {/* WHAT WE DEPLOY */}
        <section id="services" className="hairline">
          <div className="mx-auto w-full max-w-screen-2xl px-8 py-24 xl:px-16">
            <p className="mb-2 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              [ services ]
            </p>
            <h2 className="mb-12 text-2xl tracking-tight md:text-3xl">
              43 agents covering compute, data, networking, ML, ops.
            </h2>

            <div className="grid gap-12 md:grid-cols-2">
              <ProviderCard title="AWS" count={AWS_BRACKETS.length} services={AWS_BRACKETS} />
              <ProviderCard title="GCP" count={GCP_BRACKETS.length} services={GCP_BRACKETS} />
            </div>

            <p className="mt-8 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              Need something else? Drop a new agent in
              {" "}<code className="text-foreground">src/agents/agents/</code>{" "}
              following the template. The inference rule + cost entry are two more files.
            </p>
          </div>
        </section>

        {/* PRINCIPLES */}
        <section className="hairline">
          <div className="mx-auto w-full max-w-screen-2xl px-8 py-24 xl:px-16">
            <p className="mb-2 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              [ principles ]
            </p>
            <h2 className="mb-12 text-2xl tracking-tight md:text-3xl">
              Local-first. Open source. Real Terraform under the hood.
            </h2>

            <div className="grid gap-px bg-border md:grid-cols-3">
              <Principle
                title="Your machine. Your creds."
                body="AWS keys / GCP service account JSON live in the dev process — never sent to a server we control. Sign in with GitHub so we can analyze your private repos with your own permissions; no third-party telemetry."
              />
              <Principle
                title="Real Terraform. No magic."
                body="Every agent generates standard HCL. Inspect it. Edit it. Take it with you. We're a Terraform front-end, not a lock-in."
              />
              <Principle
                title="Both clouds. Or migrate."
                body="One model for AWS and GCP. Inference picks the right service per provider. Migrate by deploying to the second cloud in parallel and decommissioning the first."
              />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="hairline">
          <div className="mx-auto w-full max-w-screen-2xl px-8 py-32 text-center xl:px-16">
            <p className="mb-4 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              [ ready ]
            </p>
            <h2 className="mb-12 text-3xl tracking-tight md:text-4xl">
              Ship a codebase to the cloud. <span className="caret"></span>
            </h2>
            <Link
              href="/console"
              className="inline-flex items-center gap-1 border border-ink bg-ink px-12 py-5 text-lg uppercase tracking-wider text-cream transition-colors hover:bg-cream hover:text-ink"
            >
              <span aria-hidden>[</span>
              <span className="px-4">launch</span>
              <span aria-hidden>]</span>
            </Link>
            <p className="mt-6 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              localhost:3000/app · ~30 seconds to first deploy
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function Step({ n, name, body }: { n: string; name: string; body: string }) {
  return (
    <div className="bg-cream p-6">
      <div className="mb-3 flex items-baseline gap-3">
        <span className="text-[0.6rem] tracking-wider text-muted-foreground">{n}</span>
        <span className="text-sm uppercase tracking-wider">[ {name} ]</span>
      </div>
      <p className="text-xs leading-relaxed text-foreground/80">{body}</p>
    </div>
  );
}

function Principle({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-cream p-8">
      <h3 className="mb-3 text-base tracking-tight">{title}</h3>
      <p className="text-xs leading-relaxed text-foreground/80">{body}</p>
    </div>
  );
}

function ProviderCard({ title, count, services }: { title: string; count: number; services: string[] }) {
  return (
    <div className="border border-border p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-lg tracking-wider">[ {title} ]</h3>
        <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">{count} agents</span>
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[0.7rem] uppercase tracking-wider md:grid-cols-3">
        {services.map((s) => (
          <li key={s} className="text-foreground/80">[ {s} ]</li>
        ))}
      </ul>
    </div>
  );
}
