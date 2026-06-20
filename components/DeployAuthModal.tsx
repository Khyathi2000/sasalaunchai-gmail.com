"use client";

import { useEffect, useState } from "react";
import { BracketButton } from "./BracketButton";

interface Props {
  provider: "aws" | "gcp";
  sid?: string;
  onSaved: () => void;
  onCancel: () => void;
  reason?: "no_credential" | "invalid_credential";
  message?: string;
}

type AwsMethod = "cfn" | "paste";
type GcpMethod = "impersonate" | "oauth" | "paste";

export function DeployAuthModal({ provider, sid, onSaved, onCancel, reason, message }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className="w-full max-w-2xl border border-ink bg-cream p-6 max-h-[90vh] overflow-y-auto">
        <header className="mb-4">
          <h2 className="text-[0.65rem] uppercase tracking-wider">
            [ authorize {provider} for deployment ]
          </h2>
          <p className="mt-2 text-xs text-muted-foreground">
            {reason === "invalid_credential"
              ? `Your saved ${provider.toUpperCase()} credentials didn't pass the identity probe (${message ?? "probe failed"}). Re-authorize below.`
              : `Pick how Sasa Launch should access your ${provider.toUpperCase()} account. Production-grade options use short-lived credentials only.`}
          </p>
        </header>

        {provider === "aws" ? (
          <AwsAuth sid={sid} onSaved={onSaved} />
        ) : (
          <GcpAuth sid={sid} onSaved={onSaved} />
        )}

        <footer className="mt-6 border-t border-border pt-4 text-right">
          <button
            onClick={onCancel}
            className="text-[0.65rem] uppercase tracking-wider text-muted-foreground hover:text-ink"
          >
            cancel
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ============================================================ AWS */

function AwsAuth({ sid, onSaved }: { sid?: string; onSaved: () => void }) {
  const [method, setMethod] = useState<AwsMethod>("cfn");
  const [cfnConfigured, setCfnConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/aws/status")
      .then((r) => r.json())
      .then((d: { configured: boolean }) => setCfnConfigured(d.configured))
      .catch(() => setCfnConfigured(false));
  }, []);

  return (
    <div className="space-y-4">
      <MethodPicker
        options={[
          {
            value: "cfn",
            title: "[ launch CloudFormation ] · production-grade",
            description: cfnConfigured
              ? "One-click stack creates an IAM role with cross-account trust. We mint short-lived STS credentials per deploy. No keys stored."
              : "Requires AWS_PLATFORM_ACCOUNT_ID set on the server (or default AWS creds present). Falls back to manual paste below.",
            disabled: cfnConfigured === false,
          },
          {
            value: "paste",
            title: "[ paste access keys ] · manual",
            description:
              "Faster for testing but stores long-lived secrets. Open the IAM console deep-link below to create a fresh key.",
          },
        ]}
        value={method}
        onChange={(v) => setMethod(v as AwsMethod)}
      />

      {method === "cfn" && cfnConfigured && <AwsCfnFlow onSaved={onSaved} />}
      {method === "paste" && <AwsPasteFlow onSaved={onSaved} />}
    </div>
  );
}

function AwsCfnFlow({ onSaved }: { onSaved: () => void }) {
  const [launchInfo, setLaunchInfo] = useState<{
    quickCreateUrl: string;
    externalId: string;
    templateUrl: string;
    trustedAccount: string;
    region: string;
    isPublicTemplateUrl: boolean;
  } | null>(null);
  const [roleArn, setRoleArn] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateBody, setTemplateBody] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const copyTemplate = async () => {
    if (!templateBody) return;
    try {
      await navigator.clipboard.writeText(templateBody);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers blocking clipboard — select the textarea
      const ta = document.querySelector<HTMLTextAreaElement>("[data-cfn-template]");
      ta?.select();
    }
  };

  const copyExternalId = async () => {
    if (!launchInfo) return;
    try {
      await navigator.clipboard.writeText(launchInfo.externalId);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetch(`/api/auth/aws/launch-url?region=${region}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.message ?? d.error);
          return;
        }
        setLaunchInfo(d);
      })
      .catch((e) => setError(String(e)));
  }, [region]);

  // Localhost can't serve the template publicly — fetch the body so
  // user can copy-paste into CloudFormation Designer.
  useEffect(() => {
    if (!launchInfo || launchInfo.isPublicTemplateUrl) return;
    fetch(launchInfo.templateUrl)
      .then((r) => r.text())
      .then(setTemplateBody)
      .catch(() => setTemplateBody(null));
  }, [launchInfo]);

  const verify = async () => {
    if (!launchInfo) return;
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/aws/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleArn: roleArn.trim(),
          externalId: launchInfo.externalId,
          region,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!data.ok) {
        setError(data.message ?? data.error ?? "verification failed");
        return;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setVerifying(false);
    }
  };

  if (!launchInfo) {
    return <p className="text-xs text-muted-foreground">preparing launch url...</p>;
  }

  return (
    <div className="space-y-4 border border-border p-4 text-xs">
      <div>
        <p className="text-muted-foreground">
          Trusted account: <span className="font-mono">{launchInfo.trustedAccount}</span> · External
          ID: <span className="font-mono">{launchInfo.externalId.slice(0, 12)}...</span>
        </p>
      </div>

      <Field label="region" value={region} onChange={setRegion} placeholder="us-east-1" />

      {launchInfo.isPublicTemplateUrl ? (
        <a
          href={launchInfo.quickCreateUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full border border-ink bg-ink px-4 py-3 text-center text-xs uppercase tracking-wider text-cream hover:bg-ink/85"
        >
          [ launch CloudFormation in AWS ] →
        </a>
      ) : (
        <div className="space-y-3 border border-warn/40 bg-warn/[0.04] p-3">
          <p className="text-[0.65rem] uppercase tracking-wider text-warn">
            [ localhost detected — three-click flow ]
          </p>

          {/* Step 1: copy template */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                step 1 · copy the template
              </p>
              <button
                onClick={copyTemplate}
                disabled={!templateBody}
                className="border border-ink bg-ink px-2 py-0.5 text-[0.65rem] uppercase tracking-wider text-cream hover:bg-cream hover:text-ink disabled:opacity-50"
              >
                {copied ? "copied ✓" : "[ copy template ]"}
              </button>
            </div>
            <textarea
              readOnly
              data-cfn-template
              value={templateBody ?? "loading template..."}
              rows={6}
              className="w-full border border-border bg-cream px-2 py-1 font-mono text-[0.6rem]"
            />
          </div>

          {/* Step 2: open AWS Console */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              step 2 · open AWS Console (Create Stack page)
            </p>
            <a
              href={`https://${region}.console.aws.amazon.com/cloudformation/home?region=${region}#/stacks/create`}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-ink bg-ink px-2 py-0.5 text-[0.65rem] uppercase tracking-wider text-cream hover:bg-cream hover:text-ink"
            >
              [ open create stack ↗ ]
            </a>
          </div>
          <p className="text-[0.6rem] leading-relaxed text-muted-foreground">
            In AWS: <em>Choose an existing template</em> → <em>Upload a template file</em>, paste,
            click Next. Set <span className="font-mono">ExternalId</span> ={" "}
            <button
              onClick={copyExternalId}
              className="font-mono underline decoration-dotted hover:decoration-solid"
              title="click to copy"
            >
              {launchInfo.externalId}
            </button>
            . Then Next → Next → I acknowledge → Submit. Wait for CREATE_COMPLETE, then copy the{" "}
            <span className="font-mono">RoleArn</span> from the Outputs tab and paste below.
          </p>
        </div>
      )}

      <div className="border-t border-border pt-3">
        <Field
          label="role arn from cloudformation outputs"
          value={roleArn}
          onChange={setRoleArn}
          placeholder="arn:aws:iam::123456789012:role/SasaLaunchDeployRole"
        />
      </div>

      {error && (
        <p className="border border-err px-3 py-2 text-[0.65rem] text-err">[error] {error}</p>
      )}

      <BracketButton
        variant="primary"
        onClick={verify}
        loading={verifying}
        disabled={!roleArn.trim()}
      >
        verify & deploy →
      </BracketButton>
    </div>
  );
}

function AwsPasteFlow({ onSaved }: { onSaved: () => void }) {
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aws: {
            accessKeyId: accessKeyId.trim(),
            secretAccessKey: secretAccessKey.trim(),
            sessionToken: sessionToken.trim() || undefined,
            region: region.trim() || "us-east-1",
          },
        }),
      });
      const data = (await res.json()) as {
        status: { aws: { ok: boolean; error?: string } };
        errors: { aws?: string };
      };
      if (data.errors.aws) {
        setError(data.errors.aws);
        return;
      }
      if (!data.status.aws.ok) {
        setError(data.status.aws.error ?? "identity probe failed");
        return;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 border border-border p-4 text-xs">
      <a
        href="https://us-east-1.console.aws.amazon.com/iam/home#/security_credentials"
        target="_blank"
        rel="noopener noreferrer"
        className="text-[0.65rem] uppercase tracking-wider text-muted-foreground hover:text-ink"
      >
        ↗ open IAM credentials in AWS console
      </a>
      <Field label="access key id" value={accessKeyId} onChange={setAccessKeyId} placeholder="AKIA..." />
      <Field
        label="secret access key"
        value={secretAccessKey}
        onChange={setSecretAccessKey}
        type="password"
        placeholder="40-char secret"
      />
      <Field
        label="session token (optional, for SSO)"
        value={sessionToken}
        onChange={setSessionToken}
        type="password"
        placeholder=""
      />
      <Field label="region" value={region} onChange={setRegion} placeholder="us-east-1" />
      {error && <p className="border border-err px-3 py-2 text-[0.65rem] text-err">[error] {error}</p>}
      <BracketButton variant="primary" onClick={submit} loading={submitting}>
        save & deploy →
      </BracketButton>
    </div>
  );
}

/* ============================================================ GCP */

function GcpAuth({ sid, onSaved }: { sid?: string; onSaved: () => void }) {
  const [method, setMethod] = useState<GcpMethod>("impersonate");
  const [impersonateConfigured, setImpersonateConfigured] = useState<boolean | null>(null);
  const [oauthConfigured, setOauthConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/gcp/impersonate/status")
      .then((r) => r.json())
      .then((d: { configured: boolean }) => setImpersonateConfigured(d.configured))
      .catch(() => setImpersonateConfigured(false));
    fetch("/api/auth/gcp/status")
      .then((r) => r.json())
      .then((d: { configured: boolean }) => setOauthConfigured(d.configured))
      .catch(() => setOauthConfigured(false));
  }, []);

  return (
    <div className="space-y-4">
      <MethodPicker
        options={[
          {
            value: "impersonate",
            title: "[ service-account impersonation ] · production-grade",
            description: impersonateConfigured
              ? "Run 3 gcloud commands in your project. We mint short-lived tokens via tokenCreator. No keys stored."
              : "Requires GCP_PLATFORM_SA_EMAIL or GOOGLE_APPLICATION_CREDENTIALS on the server. Falls back to OAuth / paste.",
            disabled: impersonateConfigured === false,
          },
          {
            value: "oauth",
            title: "[ authorize via google ] · prod-grade UX",
            description: oauthConfigured
              ? "OAuth consent screen. Grants are tied to your Google user — best for single-user demos."
              : "Requires GCP_OAUTH_CLIENT_ID/SECRET on the server.",
            disabled: oauthConfigured === false,
          },
          {
            value: "paste",
            title: "[ paste service-account json ] · manual",
            description: "Stores a long-lived key. Quick for testing, not great for production.",
          },
        ]}
        value={method}
        onChange={(v) => setMethod(v as GcpMethod)}
      />

      {method === "impersonate" && impersonateConfigured && <GcpImpersonateFlow onSaved={onSaved} />}
      {method === "oauth" && oauthConfigured && <GcpOauthFlow sid={sid} />}
      {method === "paste" && <GcpPasteFlow onSaved={onSaved} />}
    </div>
  );
}

function GcpImpersonateFlow({ onSaved }: { onSaved: () => void }) {
  const [projectId, setProjectId] = useState("");
  const [saName, setSaName] = useState("sasa-launch-deployer");
  const [setupInfo, setSetupInfo] = useState<{
    platformServiceAccount: string;
    targetServiceAccount: string;
    commands: Array<{ title: string; cmd: string }>;
    notes: string[];
  } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = `/api/auth/gcp/impersonate/setup?projectId=${encodeURIComponent(projectId || "<YOUR_PROJECT_ID>")}&saName=${encodeURIComponent(saName)}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.message ?? d.error);
          return;
        }
        setSetupInfo(d);
      })
      .catch((e) => setError(String(e)));
  }, [projectId, saName]);

  const verify = async () => {
    if (!setupInfo) return;
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/gcp/impersonate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceAccountEmail: setupInfo.targetServiceAccount,
          projectId,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!data.ok) {
        setError(data.message ?? data.error ?? "verification failed");
        return;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-3 border border-border p-4 text-xs">
      <Field label="project id" value={projectId} onChange={setProjectId} placeholder="my-project-1234" />
      <Field label="service account name" value={saName} onChange={setSaName} placeholder="sasa-launch-deployer" />
      {setupInfo ? (
        <>
          <div className="border-t border-border pt-3">
            <p className="mb-1 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              [ run these in cloud shell or your terminal ]
            </p>
            {setupInfo.commands.map((c, i) => (
              <div key={i} className="mb-3 last:mb-0">
                <p className="text-muted-foreground">{c.title}</p>
                <pre className="mt-1 overflow-x-auto border border-border bg-ink/[0.04] p-2 font-mono text-[0.6rem]">
                  {c.cmd}
                </pre>
              </div>
            ))}
          </div>
          <p className="text-[0.6rem] text-muted-foreground">{setupInfo.notes[0]}</p>
        </>
      ) : (
        <p className="text-muted-foreground">loading commands...</p>
      )}
      {error && <p className="border border-err px-3 py-2 text-[0.65rem] text-err">[error] {error}</p>}
      <BracketButton variant="primary" onClick={verify} loading={verifying} disabled={!projectId.trim()}>
        verify & deploy →
      </BracketButton>
    </div>
  );
}

function GcpOauthFlow({ sid }: { sid?: string }) {
  const startGoogleAuth = () => {
    const url = sid ? `/api/auth/gcp/start?sid=${encodeURIComponent(sid)}` : "/api/auth/gcp/start";
    window.location.href = url;
  };
  return (
    <div className="space-y-3 border border-border p-4 text-xs">
      <p className="text-muted-foreground">
        Opens Google's consent screen. Grants are tied to YOUR Google user — fine for solo demos,
        not ideal for B2B (revocable by user, audit trail shows the user).
      </p>
      <BracketButton variant="primary" onClick={startGoogleAuth}>
        authorize via google →
      </BracketButton>
    </div>
  );
}

function GcpPasteFlow({ onSaved }: { onSaved: () => void }) {
  const [saJson, setSaJson] = useState("");
  const [projectId, setProjectId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gcp: { serviceAccountJson: saJson.trim(), projectId: projectId.trim() || undefined },
        }),
      });
      const data = (await res.json()) as {
        status: { gcp: { ok: boolean; error?: string } };
        errors: { gcp?: string };
      };
      if (data.errors.gcp) {
        setError(data.errors.gcp);
        return;
      }
      if (!data.status.gcp.ok) {
        setError(data.status.gcp.error ?? "identity probe failed");
        return;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 border border-border p-4 text-xs">
      <textarea
        value={saJson}
        onChange={(e) => setSaJson(e.target.value)}
        placeholder='{ "type": "service_account", "project_id": "...", ... }'
        rows={6}
        className="w-full border border-border bg-cream px-2 py-1 font-mono text-[0.65rem] focus:border-ink focus:outline-none"
      />
      <Field label="project id (override)" value={projectId} onChange={setProjectId} placeholder="auto-detected" />
      {error && <p className="border border-err px-3 py-2 text-[0.65rem] text-err">[error] {error}</p>}
      <BracketButton variant="primary" onClick={submit} loading={submitting}>
        save & deploy →
      </BracketButton>
    </div>
  );
}

/* =================================================== UI primitives */

function MethodPicker({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; title: string; description: string; disabled?: boolean }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={
              "block w-full border p-3 text-left text-xs " +
              (selected
                ? "border-ink bg-ink/[0.04]"
                : "border-border hover:border-ink/40") +
              (o.disabled ? " opacity-50 cursor-not-allowed" : "")
            }
          >
            <p className="font-mono">{o.title}</p>
            <p className="mt-1 text-[0.65rem] text-muted-foreground">{o.description}</p>
          </button>
        );
      })}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.65rem] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="w-full border border-border bg-cream px-2 py-1 font-mono text-xs focus:border-ink focus:outline-none"
      />
    </label>
  );
}
