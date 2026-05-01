"use client";

import { useEffect, useState } from "react";
import { BracketButton } from "./BracketButton";

interface CredentialStatus {
  aws: { ok: boolean; accountId?: string; region?: string; error?: string };
  gcp: { ok: boolean; projectId?: string; needsAuth: boolean; error?: string };
  github?: { ok: boolean };
}

export function AuthPanel() {
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [open, setOpen] = useState(false);
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

  // GitHub form
  const [ghToken, setGhToken] = useState("");

  const refresh = async () => {
    try {
      const res = await fetch("/api/credentials");
      const data = (await res.json()) as CredentialStatus;
      setStatus(data);
    } catch {
      setStatus(null);
    }
  };

  useEffect(() => {
    refresh();
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
    if (ghToken.trim()) {
      body.github = { token: ghToken.trim() };
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
      const data = (await res.json()) as { status: CredentialStatus; errors: { aws?: string; gcp?: string; github?: string } };
      setStatus(data.status);
      const e = [data.errors.aws, data.errors.gcp, data.errors.github].filter(Boolean).join(" · ");
      if (e) setError(e);
      else {
        // Clear secrets from form on success
        setSecretAccessKey("");
        setSaJson("");
        setGhToken("");
        setOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const allOk = status?.aws.ok && status?.gcp.ok;
  const someOk = status?.aws.ok || status?.gcp.ok;

  return (
    <div className="border-b border-border bg-ink/[0.02]">
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-8 py-2 text-[0.65rem] uppercase tracking-wider xl:px-16">
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">[ cloud auth ]</span>
          {status && (
            <>
              <Badge label="aws" ok={status.aws.ok} detail={status.aws.accountId ?? status.aws.error} />
              <Badge label="gcp" ok={status.gcp.ok} detail={status.gcp.projectId ?? (status.gcp.needsAuth ? "auth needed" : status.gcp.error)} />
              <Badge label="github" ok={!!status.github?.ok} detail={status.github?.ok ? "token set" : "anonymous"} />
            </>
          )}
          {!status && <span className="text-muted-foreground">probing...</span>}
        </div>
        <div className="flex items-center gap-3">
          {!allOk && !open && (
            <span className="normal-case text-muted-foreground">
              {someOk ? "one provider configured" : "paste credentials below to enable real deploys"}
            </span>
          )}
          <BracketButton onClick={() => setOpen((o) => !o)} variant={allOk ? "default" : "primary"}>
            {open ? "close" : allOk ? "edit creds" : "add creds"}
          </BracketButton>
        </div>
      </div>

      {open && (
        <div className="mx-auto grid max-w-screen-2xl gap-8 px-8 pb-6 pt-2 text-xs xl:grid-cols-2 xl:px-16">
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

          <div className="space-y-3 border border-border p-4 xl:col-span-2">
            <h3 className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">[ github ]</h3>
            <p className="text-muted-foreground">
              optional — only needed if you hit github's anonymous rate limit (60 req/hour). a fine-grained
              personal-access-token with public repo read is enough.{" "}
              <a className="underline" href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">
                create one
              </a>
              .
            </p>
            <Field
              label="github token"
              value={ghToken}
              onChange={setGhToken}
              type="password"
              placeholder="ghp_... or github_pat_..."
            />
          </div>

          <div className="flex items-center justify-between xl:col-span-2">
            <p className="text-[0.65rem] text-muted-foreground">
              creds live in this dev-server process only. they're not written to session.json.
              gcp json is staged at $TMPDIR/launch-platform-creds/gcp-sa.json with mode 0600.
            </p>
            <BracketButton variant="primary" onClick={submit} loading={submitting}>
              save & verify
            </BracketButton>
          </div>
          {error && (
            <p className="border border-err px-3 py-2 text-[0.65rem] text-err xl:col-span-2">[error] {error}</p>
          )}
        </div>
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
