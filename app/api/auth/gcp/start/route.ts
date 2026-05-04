import { NextResponse } from "next/server";
import { ensureUser } from "@/lib/auth/user";
import {
  buildAuthUrl,
  isConfigured,
  makeState,
  OAuthNotConfiguredError,
} from "@/lib/auth/gcp-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Redirect target for the "Authorize via Google" button. Builds a
 * state-protected URL and 302s the user to Google's consent screen. */
export async function GET(req: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      {
        error: "oauth_not_configured",
        message: new OAuthNotConfiguredError().message,
      },
      { status: 503 },
    );
  }
  const userId = await ensureUser();
  const url = new URL(req.url);
  const sid = url.searchParams.get("sid") ?? undefined;
  const state = makeState({ userId, sid });
  return NextResponse.redirect(buildAuthUrl(state));
}
