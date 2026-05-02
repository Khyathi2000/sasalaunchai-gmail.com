import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/login(.*)",
  "/signup(.*)",
]);

const isApiRoute = createRouteMatcher(["/api/(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  const { userId, redirectToSignIn } = await auth();
  if (userId) return;

  if (isApiRoute(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return redirectToSignIn();
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|.*\\..*).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
