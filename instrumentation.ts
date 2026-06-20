// Next.js startup hook. Runs once when the Node.js runtime boots, before
// any request reaches a route handler. We use it to async-initialize the
// Drizzle / PGlite client so the synchronous `db()` getter can return
// the cached instance.
//
// Edge runtime is skipped because PGlite, postgres-js, and KMS clients
// all need Node APIs.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { initDb, dbMode } = await import("./lib/db/index.js");
  await initDb();
  // eslint-disable-next-line no-console
  console.log(`[instrumentation] db ready (mode=${dbMode()})`);
}
