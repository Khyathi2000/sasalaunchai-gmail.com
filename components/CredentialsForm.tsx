"use client";

import { useEffect, useState } from "react";
import { BracketButton } from "./BracketButton";

interface CredentialStatus {
  aws: { ok: boolean; accountId?: string; region?: string; error?: string };
  gcp: { ok: boolean; projectId?: string; needsAuth: boolean; error?: string };
}

interface StoredCredential {
  id: string;
  provider: "aws" | "gcp";
  label: string;
  awsAccountId?: string;
  awsRegion?: string;
  gcpProjectId?: string;
  createdAt: string;
  updatedAt: string;
}

export function CredentialsForm() {
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [stored, setStored] = useState<StoredCredential[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // AWS form
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [region, setRegion] = useState("us-east-1");

  // GCP form
  const [saJson, setSaJson] = useState("");
  const [projectId, setProjectId] = useState("");

  const loadStored = async () => {
    try {
      const res = await fetch("/api/credentials");
      const data = (await res.json()) as { stored: StoredCredential[] };
      setStored(data.stored ?? []);
    } catch {
      setStored([]);
    }
  };

  const probe = async () => {
    try {
      const res = await fetch("/api/credentials?probe=1");
      const data = (await res.json()) as CredentialStatus;
      setStatus(data);
    } catch {
      setStatus(null);
    }
  };

  useEffect(() => {
    loadStored();
    probe();
  }, []);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const body: Record<string, unknown> = {};
    if (accessKeyId && secretAccessKey) {
      body.aws = {
        accessKeyId: accessKeyId.trim(),
        secretAccessKey: secretAccessKey.trim(),
        sessionToken: sessionToken.trim() || undefined,
        region: region.trim() || "us-east-1",
      };
    }
    if (saJson.trim()) {
      body.gcp = { serviceAccountJson: saJson.trim(), projectId: projectId.trim() || undefined };
    }
    if (Object.keys(body).length === 0) {
      setError("Paste at least one credential set.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { status: CredentialStatus; errors: { aws?: string; gcp?: string } };
      setStatus(data.status);
      const e = [data.errors.aws, data.errors.gcp].filter(Boolean).join(" · ");
      if (e) {
        setError(e);
      } else {
        setSecretAccessKey("");
        setSaJson("");
        setSavedAt(Date.now());
        await loadStored();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (provider: "aws" | "gcp", label: string) => {
    if (!confirm(`Delete the ${provider} credential "${label}"?`)) return;
    await fetch(`/api/credentials?provider=${provider}&label=${encodeURIComponent(label)}`, {
      method: "DELETE",
    });
    await loadStored();
    await probe();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 text-[0.65rem] uppercase tracking-wider">
        {status ? (
          <>
            <Badge label="aws" ok={status.aws.ok} detail={status.aws.accountId ?? status.aws.error} />
            <Badge
              label="gcp"
              ok={status.gcp.ok}
              detail={status.gcp.projectId ?? (status.gcp.needsAuth ? "auth needed" : status.gcp.error)}
            />
          </>
        ) : (
          <span className="text-muted-foreground">probing...</span>
        )}
      </div>

      {stored.length > 0 && (
        <div className="border border-border p-4">
          <h3 className="mb-3 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
            [ stored credentials ]
          </h3>
          <ul className="space-y-2 text-xs">
            {stored.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 border-b border-border/40 pb-2 last:border-b-0 last:pb-0"
              >
                <span className="font-mono">
                  [{s.provider}] {s.label}
                  {s.awsAccountId && ` · acct ${s.awsAccountId}`}
                  {s.awsRegion && ` · ${s.awsRegion}`}
                  {s.gcpProjectId && ` · proj ${s.gcpProjectId}`}
                </span>
                <button
                  onClick={() => remove(s.provider, s.label)}
                  className="text-[0.65rem] uppercase tracking-wider text-muted-foreground hover:text-err"
                >
                  delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 text-xs xl:grid-cols-2">
        <div className="space-y-3 border border-border p-4">
          <h3 className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">[ aws ]</h3>
          <Field label="access key id" value={accessKeyId} onChange={setAccessKeyId} placeholder="AKIA..." />
          <Field label="secret access key" value={secretAccessKey} onChange={setSecretAccessKey} type="password" placeholder="40-char secret" />
          <Field label="session token (sso/temporary)" value={sessionToken} onChange={setSessionToken} type="password" placeholder="optional" />
          <Field label="region" value={region} onChange={setRegion} placeholder="us-east-1" />
        </div>

        <div className="space-y-3 border border-border p-4">
          <h3 className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">[ gcp ]</h3>
          <p className="text-muted-foreground">
            paste a service account key JSON. needs roles for the resources you'll deploy
            (compute admin, sql admin, storage admin, etc.).
          </p>
          <textarea
            value={saJson}
            onChange={(e) => setSaJson(e.target.value)}
            placeholder='{ "type": "service_account", "project_id": "...", ... }'
            rows={8}
            className="w-full border border-border bg-cream px-2 py-1 font-mono text-[0.65rem] focus:border-ink focus:outline-none"
          />
          <Field label="project id (override)" value={projectId} onChange={setProjectId} placeholder="auto-detected from json" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="text-[0.65rem] text-muted-foreground">
          credentials are envelope-encrypted (AES-256-GCM, KMS-wrapped DEK) and stored
          per-user. plaintext only lives in process memory for the duration of one request.
        </p>
        <BracketButton variant="primary" onClick={submit} loading={submitting}>
          save & verify
        </BracketButton>
      </div>

      {error && (
        <p className="border border-err px-3 py-2 text-[0.65rem] text-err">[error] {error}</p>
      )}
      {savedAt && !error && (
        <p className="border border-border bg-ink/[0.03] px-3 py-2 text-[0.65rem] text-muted-foreground">
          saved · refreshed credential probe
        </p>
      )}
    </div>
  );
}

function Badge({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span aria-hidden style={{ color: ok ? "hsl(var(--ok))" : "hsl(var(--muted))" }}>
        {ok ? "●" : "○"}
      </span>
      <span>{label}</span>
      {detail && <span className="normal-case text-foreground/60">{detail}</span>}
    </span>
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
