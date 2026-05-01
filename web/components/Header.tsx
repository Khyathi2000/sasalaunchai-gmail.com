"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";

interface CredentialStatus {
  aws: { ok: boolean; accountId?: string; error?: string };
  gcp: { ok: boolean; projectId?: string; needsAuth: boolean; error?: string };
}

export function Header() {
  const sid = useStore((s) => s.sid);
  const [creds, setCreds] = useState<CredentialStatus | null>(null);

  useEffect(() => {
    fetch("/api/credentials")
      .then((r) => r.json())
      .then(setCreds)
      .catch(() => setCreds(null));
  }, []);

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-6 py-4">
        <div className="flex items-baseline gap-3">
          <span className="text-base tracking-wider">[ LAUNCH ]</span>
          <span className="text-xs text-muted-foreground">multi-cloud deployment</span>
        </div>
        <div className="flex items-center gap-4 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          {sid && <span>sid: {sid.slice(-8)}</span>}
          {creds && (
            <>
              <CredBadge label="aws" ok={creds.aws.ok} detail={creds.aws.accountId ?? creds.aws.error} />
              <CredBadge
                label="gcp"
                ok={creds.gcp.ok}
                detail={creds.gcp.projectId ?? (creds.gcp.needsAuth ? "auth needed" : creds.gcp.error)}
              />
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function CredBadge({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
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
