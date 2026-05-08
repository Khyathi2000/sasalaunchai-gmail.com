import type { Dependency } from "../types/index";

interface WhyExplanation {
  description: string;
  whyChosen: string;
  category: Dependency["category"];
  alternatives: { name: string; description: string; pros: string[]; cons: string[] }[];
  weeklyDownloads: number;
  license: string;
}

const defaultExplanation: WhyExplanation = {
  description: "A package used in this project.",
  whyChosen: "This package provides functionality needed by the project.",
  category: "utility",
  alternatives: [],
  weeklyDownloads: 0,
  license: "MIT",
};

const whyDatabase: Record<string, WhyExplanation> = {
  next: { description: "The React framework for production — SSR, static generation, API routes.", whyChosen: "Provides full-stack React framework with server components, code splitting, and built-in API routes.", category: "framework", alternatives: [{ name: "Remix", description: "Full-stack React framework", pros: ["Nested routing", "Progressive enhancement"], cons: ["Smaller ecosystem"] }], weeklyDownloads: 6200000, license: "MIT" },
  react: { description: "JavaScript library for building user interfaces.", whyChosen: "Most widely adopted UI library with massive ecosystem.", category: "framework", alternatives: [{ name: "Vue", description: "Progressive framework", pros: ["Gentler learning curve"], cons: ["Smaller enterprise adoption"] }], weeklyDownloads: 24000000, license: "MIT" },
  express: { description: "Minimalist web framework for Node.js.", whyChosen: "Most popular Node.js web framework with middleware pattern.", category: "framework", alternatives: [{ name: "Fastify", description: "Fast web framework", pros: ["Better performance"], cons: ["Smaller ecosystem"] }], weeklyDownloads: 35000000, license: "MIT" },
  prisma: { description: "Type-safe ORM for Node.js and TypeScript.", whyChosen: "Auto-generated TypeScript types from schema, migration system.", category: "database", alternatives: [{ name: "Drizzle", description: "Lightweight TypeScript ORM", pros: ["SQL-like", "Lighter"], cons: ["Newer"] }], weeklyDownloads: 2400000, license: "Apache-2.0" },
  "@prisma/client": { description: "Auto-generated type-safe query builder for Prisma.", whyChosen: "Runtime query engine generated from schema.", category: "database", alternatives: [], weeklyDownloads: 2400000, license: "Apache-2.0" },
  tailwindcss: { description: "Utility-first CSS framework.", whyChosen: "Utility-first approach eliminates context-switching, produces smaller bundles.", category: "ui", alternatives: [], weeklyDownloads: 9500000, license: "MIT" },
  zustand: { description: "Small, fast state management.", whyChosen: "Minimal API, tiny bundle, no providers needed.", category: "state", alternatives: [{ name: "Redux Toolkit", description: "Official Redux toolset", pros: ["DevTools"], cons: ["More boilerplate"] }], weeklyDownloads: 4200000, license: "MIT" },
  typescript: { description: "Typed superset of JavaScript.", whyChosen: "Catches errors at compile time, enables safe refactoring.", category: "build", alternatives: [], weeklyDownloads: 52000000, license: "Apache-2.0" },
  mongoose: { description: "MongoDB object modeling for Node.js.", whyChosen: "Adds schema validation and middleware to MongoDB.", category: "database", alternatives: [], weeklyDownloads: 3500000, license: "MIT" },
  pg: { description: "PostgreSQL client for Node.js.", whyChosen: "Standard PostgreSQL driver with connection pooling.", category: "database", alternatives: [], weeklyDownloads: 6500000, license: "MIT" },
  "@anthropic-ai/sdk": { description: "Official TypeScript SDK for the Anthropic API.", whyChosen: "Type-safe access to Claude API with streaming support.", category: "api", alternatives: [], weeklyDownloads: 500000, license: "MIT" },
  stripe: { description: "Node.js library for Stripe payment processing.", whyChosen: "Industry-standard payment processor for SaaS.", category: "api", alternatives: [], weeklyDownloads: 2500000, license: "MIT" },
};

export function getWhyExplanation(packageName: string): WhyExplanation {
  return whyDatabase[packageName] || { ...defaultExplanation, description: `${packageName} — a package used in this project.` };
}

export function hasWhyExplanation(packageName: string): boolean {
  return packageName in whyDatabase;
}
