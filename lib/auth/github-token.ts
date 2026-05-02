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

export async function getCurrentUserGithubToken(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new GithubNotConnectedError("not signed in");
  const client = await clerkClient();
  const tokens = await client.users.getUserOauthAccessToken(userId, "oauth_github");
  const token = tokens.data[0]?.token;
  if (!token) throw new GithubNotConnectedError("no github oauth token on file");
  return token;
}
