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

/**
 * Inline credential prompt that pops up when the user clicks "deploy"
 * but doesn't have working cloud credentials for the target provider.
 *
 * Two paths to capture creds:
 *  - Click-to-authorize: Google OAuth (GCP) or "open IAM console" (AWS)
 *  - Manual paste: access keys / service-account JSON, behind a toggle
 */
export function DeployAuthModal({ provider, sid, onSaved, onCancel, reason, message }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState<boolean | null>(null);

  // AWS form
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [region, setRegion] = useState("us-east-1");

  // GCP form
  const [saJson, setSaJson] = useState("");
  const [projectId, setProjectId] = useState("");

  // Probe whether GCP OAuth is configured server-side. The "Authorize via
  // Google" button stays disabled with a setup hint when it isn't.
  useEffect(() => {
    if (provider !== "gcp") return;
    fetch("/api/auth/gcp/status")
      .then((r) => r.json())
      .then((d: { configured: boolean }) => setOauthConfigured(d.configured))
      .catch(() => setOauthConfigured(false));
  }, [provider]);

  const startGoogleAuth = () => {
    const url = sid ? `/api/auth/gcp/start?sid=${encodeURIComponent(sid)}` : "/api/auth/gcp/start";
    // Top-level navigation — Google's consent screen blocks framing.
    window.location.href = url;
  };

  const openAwsConsole = () => {
    window.open(
      "https://us-east-1.console.aws.amazon.com/iam/home#/security_credentials",
      "_blank",
      "noopener,noreferrer",
    );
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const body: Record<string, unknown> = {};
    if (provider === "aws") {
      if (!accessKeyId.trim() || !secretAccessKey.trim()) {
        setError("access key id and secret access key are required");
        setSubmitting(false);
        return;
      }
      body.aws = {
        accessKeyId: accessKeyId.trim(),
        secretAccessKey: secretAccessKey.trim(),
        sessionToken: sessionToken.trim() || undefined,
        region: region.trim() || "us-east-1",
      };
    } else {
      if (!saJson.trim()) {
        setError("paste the service account json");
        setSubmitting(false);
        return;
      }
      body.gcp = { serviceAccountJson: saJson.trim(), projectId: projectId.trim() || undefined };
    }

    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        status: { aws: { ok: boolean; error?: string }; gcp: { ok: boolean; error?: string } };
        errors: { aws?: string; gcp?: string };
      };
      const fieldErr = data.errors[provider];
      if (fieldErr) {
        setError(fieldErr);
        return;
      }
      const branch = data.status[provider];
      if (!branch.ok) {
        setError(branch.error ?? "identity probe failed");
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4"
      role="dialog"
      aria-modal="true"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <div className="w-full max-w-lg border border-ink bg-cream p-6">
        <header className="mb-4">
          <h2 className="text-[0.65rem] uppercase tracking-wider">
            [ authorize {provider} for deployment ]
          </h2>
          <p className="mt-2 text-xs text-muted-foreground">
            {reason === "invalid_credential"
              ? `Your saved ${provider.toUpperCase()} credentials didn't pass the identity probe (${message ?? "probe failed"}). Re-authorize below.`
              : `Before deploying we need ${provider.toUpperCase()} access. Authorize once — credentials are envelope-encrypted (AES-256-GCM, KMS-wrapped) and stored against your account.`}
          </p>
        </header>

        {/* Click-to-authorize: primary path */}
        {provider === "gcp" ? (
          <div className="space-y-3">
            <button
              onClick={startGoogleAuth}
              disabled={!oauthConfigured}
              className="w-full border border-ink bg-ink px-4 py-3 text-xs uppercase tracking-wider text-cream hover:bg-ink/85 disabled:cursor-not-allowed disabled:bg-muted/30 disabled:text-muted-foreground"
            >
              [ authorize via google ] →
            </button>
            <p className="text-[0.65rem] text-muted-foreground">
              {oauthConfigured === false
                ? "Set GCP_OAUTH_CLIENT_ID + GCP_OAUTH_CLIENT_SECRET + GCP_OAUTH_REDIRECT_URI in env to enable. See lib/auth/gcp-oauth.ts for setup."
                : oauthConfigured === null
                  ? "Checking server config..."
                  : "Opens Google's consent screen. Pick the project + billing account, grant cloud-platform scope. We capture a refresh token, never a long-lived secret."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={openAwsConsole}
              className="w-full border border-ink bg-ink px-4 py-3 text-xs uppercase tracking-wider text-cream hover:bg-ink/85"
            >
              [ open aws iam console ] →
            </button>
            <p className="text-[0.65rem] text-muted-foreground">
              Opens the IAM credentials page in a new tab. Create an access key (or use AWS SSO
              session creds), then paste the values below. We probe with STS:GetCallerIdentity to
              confirm before saving.
            </p>
          </div>
        )}

        {/* Manual paste — collapsed by default for GCP if OAuth is on,
            always visible for AWS. */}
        <div className="mt-5 border-t border-border pt-4">
          {provider === "gcp" && oauthConfigured && !showManual ? (
            <button
              onClick={() => setShowManual(true)}
              className="text-[0.65rem] uppercase tracking-wider text-muted-foreground hover:text-ink"
            >
              [ paste service-account json instead ]
            </button>
          ) : (
            <>
              <h3 className="mb-3 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                {provider === "aws" ? "[ paste access keys ]" : "[ paste service-account json ]"}
              </h3>
              {provider === "aws" ? (
                <div className="space-y-3 text-xs">
                  <Field
                    label="access key id"
                    value={accessKeyId}
                    onChange={setAccessKeyId}
                    placeholder="AKIA..."
                  />
                  <Field
                    label="secret access key"
                    value={secretAccessKey}
                    onChange={setSecretAccessKey}
                    type="password"
                    placeholder="40-char secret"
                  />
                  <Field
                    label="session token (sso / temporary)"
                    value={sessionToken}
                    onChange={setSessionToken}
                    type="password"
                    placeholder="optional"
                  />
                  <Field label="region" value={region} onChange={setRegion} placeholder="us-east-1" />
                </div>
              ) : (
                <div className="space-y-3 text-xs">
                  <textarea
                    value={saJson}
                    onChange={(e) => setSaJson(e.target.value)}
                    placeholder='{ "type": "service_account", "project_id": "...", ... }'
                    rows={6}
                    className="w-full border border-border bg-cream px-2 py-1 font-mono text-[0.65rem] focus:border-ink focus:outline-none"
                  />
                  <Field
                    label="project id (override)"
                    value={projectId}
                    onChange={setProjectId}
                    placeholder="auto-detected from json"
                  />
                </div>
              )}
            </>
          )}
        </div>

        {error && (
          <p className="mt-3 border border-err px-3 py-2 text-[0.65rem] text-err">
            [error] {error}
          </p>
        )}

        <footer className="mt-5 flex justify-between gap-3">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="text-[0.65rem] uppercase tracking-wider text-muted-foreground hover:text-ink disabled:opacity-50"
          >
            cancel
          </button>
          {(provider === "aws" || showManual) && (
            <BracketButton variant="primary" onClick={submit} loading={submitting}>
              save & deploy →
            </BracketButton>
          )}
        </footer>
      </div>
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
