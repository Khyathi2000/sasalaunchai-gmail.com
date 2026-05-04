// GitHub-token helpers. The parser can talk to GitHub unauthenticated
// for public repos (lower rate limit, no private access) so we treat the
// token as optional here.
//
// Resolution order:
//   1. The user's Clerk OAuth GitHub token (if they connected GitHub)
//   2. The server-side GITHUB_TOKEN env var (handy for local dev)
//   3. null (parser falls back to unauthenticated calls)

import { auth, clerkClient } from "@clerk/nextjs/server";

export class GithubNotConnectedError extends Error {
  constructor(message = "GitHub account not connected") {
    super(message);
    this.name = "GithubNotConnectedError";
  }
}

export class RepoNotAccessibleError extends Error {
  constructor(message = "Repository not accessible with the signed-in GitHub account") {
    super(message);
    this.name = "RepoNotAccessibleError";
  }
}

/**
 * Returns the best available GitHub token, or null if none exists.
 * Never throws — callers decide whether to require auth (for private repos)
 * or proceed unauthenticated (public repos).
 */
export async function getCurrentUserGithubToken(): Promise<string | null> {
  const fromClerk = await tryClerkGithubToken();
  if (fromClerk) return fromClerk;
  const fromEnv = process.env.GITHUB_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  return null;
}

async function tryClerkGithubToken(): Promise<string | null> {
  try {
    const { userId } = await auth();
    if (!userId) return null;
    const client = await clerkClient();
    const tokens = await client.users.getUserOauthAccessToken(userId, "oauth_github");
    return tokens.data[0]?.token ?? null;
  } catch {
    // Clerk dev environments without GitHub configured throw here.
    return null;
  }
}

/**
 * Strict variant for code paths that require a token (e.g. cloning a
 * confirmed-private repo). Throws GithubNotConnectedError when missing.
 */
export async function requireUserGithubToken(): Promise<string> {
  const token = await getCurrentUserGithubToken();
  if (!token) throw new GithubNotConnectedError();
  return token;
}
