"use client";

import { useState } from "react";
import { BracketButton } from "./BracketButton";

interface Props {
  provider: "aws" | "gcp";
  onSaved: () => void;
  onCancel: () => void;
  reason?: "no_credential" | "invalid_credential";
  message?: string;
}

/**
 * Inline credential prompt that pops up when the user clicks "deploy"
 * but doesn't have working cloud credentials for the target provider.
 * Single-provider, scoped to the plan being deployed.
 */
export function DeployAuthModal({ provider, onSaved, onCancel, reason, message }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AWS form
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [region, setRegion] = useState("us-east-1");

  // GCP form
  const [saJson, setSaJson] = useState("");
  const [projectId, setProjectId] = useState("");

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
              ? `Your saved ${provider.toUpperCase()} credentials didn't pass the identity probe (${message ?? "STS call failed"}). Paste fresh ones below — they replace the old set.`
              : `Before deploying we need ${provider.toUpperCase()} credentials. They're envelope-encrypted (AES-256-GCM, KMS-wrapped) and stored against your account.`}
          </p>
        </header>

        {provider === "aws" ? (
          <div className="space-y-3 text-xs">
            <Field label="access key id" value={accessKeyId} onChange={setAccessKeyId} placeholder="AKIA..." autoFocus />
            <Field
              label="secret access key"
              value={secretAccessKey}
              onChange={setSecretAccessKey}
              type="password"
              placeholder="40-char secret"
            />
            <Field
              label="session token (sso/temporary)"
              value={sessionToken}
              onChange={setSessionToken}
              type="password"
              placeholder="optional"
            />
            <Field label="region" value={region} onChange={setRegion} placeholder="us-east-1" />
          </div>
        ) : (
          <div className="space-y-3 text-xs">
            <p className="text-muted-foreground">
              paste the full service account JSON. needs roles for the resources you'll deploy
              (compute admin, sql admin, storage admin, etc.).
            </p>
            <textarea
              value={saJson}
              onChange={(e) => setSaJson(e.target.value)}
              placeholder='{ "type": "service_account", "project_id": "...", ... }'
              rows={8}
              autoFocus
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
          <BracketButton variant="primary" onClick={submit} loading={submitting}>
            authorize & deploy →
          </BracketButton>
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
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  type?: string;
  placeholder?: string;
  autoFocus?: boolean;
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
        autoFocus={autoFocus}
        className="w-full border border-border bg-cream px-2 py-1 font-mono text-xs focus:border-ink focus:outline-none"
      />
    </label>
  );
}
