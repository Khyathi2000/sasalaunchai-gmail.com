"use client";

/**
 * Trust-builder section. Three production-grade auth flows visualized
 * as ASCII-style diagrams (drawn in SVG so they look crisp at any
 * zoom). Pairs with copy explaining the security model.
 */

const PILLARS = [
  {
    title: "Envelope-encrypted vault",
    body:
      "AWS keys / GCP service-account JSON are never stored as plaintext. A per-row 32-byte data encryption key (AES-256-GCM) seals the credential blob; that DEK is wrapped by a Cloud KMS master key. Plaintext only lives in process memory for the duration of one request.",
    annotation: "AES-256-GCM · KMS-wrapped DEK",
  },
  {
    title: "AWS — CloudFormation + AssumeRole",
    body:
      "Click Launch in AWS. Customer creates an IAM role with our trust policy + per-installation external ID. We mint short-lived STS credentials per deploy via sts:AssumeRole. No long-lived AWS keys ever cross the wire.",
    annotation: "no keys at rest · 1-hour STS sessions",
  },
  {
    title: "GCP — service-account impersonation",
    body:
      "Customer grants our runtime service account the iam.serviceAccountTokenCreator role on their deployer SA. We mint short-lived access tokens via iamcredentials.generateAccessToken. Revocable in one binding.",
    annotation: "no keys at rest · 1-hour access tokens",
  },
];

export function SecuritySection() {
  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
      <div>
        <h2 className="text-3xl tracking-tight md:text-4xl">
          <span className="display-serif italic">Production-grade</span> cloud auth.
          <br />
          Zero stored secrets.
        </h2>
        <p className="mt-6 max-w-md text-sm leading-relaxed text-foreground/80">
          Every connection is short-lived. Every revocation is one click in the customer's
          console. The audit trail in their cloud names <em className="display-serif-italic">Sasa Launch</em>,
          not a person.
        </p>

        {/* ASCII-style flow diagram */}
        <div className="mt-10 overflow-x-auto border border-ink p-4 font-mono text-[0.65rem] leading-relaxed text-foreground/80">
          <pre className="whitespace-pre">{`  user clicks deploy
       │
       ▼
  vault.read(userId, provider)        ← encrypted at rest
       │
       ▼
  STS:AssumeRole / generateAccessToken
       │
       ▼
  temp creds on env (1h)              ← never persisted
       │
       ▼
  terraform apply
       │
       ▼
  creds expire, rotate, repeat`}</pre>
        </div>
      </div>

      <div className="space-y-px bg-border">
        {PILLARS.map((p) => (
          <div key={p.title} className="bg-cream p-6">
            <h3 className="text-base tracking-tight">{p.title}</h3>
            <p className="mt-2 text-xs leading-relaxed text-foreground/80">{p.body}</p>
            <p className="mt-3 inline-block border border-border px-2 py-0.5 text-[0.6rem] uppercase tracking-wider text-muted-foreground">
              {p.annotation}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
