"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UserButton, useUser } from "@clerk/nextjs";
import { useStore } from "@/lib/store";

interface CredentialStatus {
  aws: { ok: boolean; accountId?: string; error?: string };
  gcp: { ok: boolean; projectId?: string; needsAuth: boolean; error?: string };
}

// Inline SVG so we don't pull in another icon dep.
function KeyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
      <circle cx="7.5" cy="15.5" r="3.5" />
      <path d="M10 13l9-9" />
      <path d="M16 7l3 3" />
    </svg>
  );
}

export function Header() {
  const sid = useStore((s) => s.sid);
  const { isSignedIn, isLoaded } = useUser();
  const [creds, setCreds] = useState<CredentialStatus | null>(null);

  // /api/credentials is auth-gated by middleware. Skip the fetch (and the
  // guaranteed 401) until Clerk confirms a session — otherwise an unauth
  // render would crash on `creds.aws.ok` after parsing the 401 body.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    fetch("/api/credentials")
      .then((r) => (r.ok ? r.json() : null))
      .then(setCreds)
      .catch(() => setCreds(null));
  }, [isLoaded, isSignedIn]);

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/console" className="flex items-baseline gap-3 hover:opacity-70">
          <span className="text-base tracking-wider">[ LAUNCH ]</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">multi-cloud deployment</span>
        </Link>

        <div className="flex items-center gap-4 text-[0.65rem] uppercase tracking-wider text-muted-foreground">
          {creds?.aws && creds?.gcp && (
            <Link
              href="/settings/credentials"
              title="manage credentials"
              className="flex items-center gap-3 border border-transparent px-2 py-1 hover:border-border hover:text-foreground"
            >
              <CredBadge label="aws" ok={creds.aws.ok} detail={creds.aws.accountId ?? creds.aws.error} />
              <CredBadge
                label="gcp"
                ok={creds.gcp.ok}
                detail={creds.gcp.projectId ?? (creds.gcp.needsAuth ? "auth needed" : creds.gcp.error)}
              />
            </Link>
          )}
          {sid && <span>sid: {sid.slice(-8)}</span>}

          <UserButton>
            <UserButton.MenuItems>
              <UserButton.Link
                label="Credentials"
                labelIcon={<KeyIcon />}
                href="/settings/credentials"
              />
            </UserButton.MenuItems>
          </UserButton>
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
