/**
 * Endless horizontal marquee of the technologies the platform recognizes.
 * Pure CSS — no JS. Width is doubled in the markup so the
 * `animation: marquee-x` translateX(-50%) loops seamlessly.
 */

const ITEMS = [
  "next.js", "react", "vue", "svelte", "remix", "fastapi", "django", "flask",
  "express", "hono", "fastify", "nestjs", "go", "gin", "rust", "axum",
  "postgres", "mysql", "mongodb", "dynamodb", "firestore", "redis",
  "prisma", "drizzle", "sqlalchemy", "mongoose",
  "clerk", "auth0", "cognito", "next-auth",
  "anthropic", "openai", "vertex-ai", "bedrock", "langchain",
  "docker", "kubernetes", "helm", "terraform",
  "stripe", "shopify", "supabase",
];

export function Marquee() {
  // Doubled list lets the -50% translate cycle seamlessly.
  const doubled = [...ITEMS, ...ITEMS];
  return (
    <div className="relative overflow-hidden border-y border-border bg-cream py-4">
      <div
        className="flex w-max marquee gap-12 text-[0.7rem] uppercase tracking-wider text-muted-foreground"
        style={{ paddingInline: "2rem" }}
      >
        {doubled.map((item, i) => (
          <span key={`${item}-${i}`} className="flex items-center gap-3 whitespace-nowrap">
            <span className="text-ember/70">·</span>
            <span>{item}</span>
          </span>
        ))}
      </div>
      {/* Edge fades — soften the marquee borders into the cream bg */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-cream to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-cream to-transparent" />
    </div>
  );
}
