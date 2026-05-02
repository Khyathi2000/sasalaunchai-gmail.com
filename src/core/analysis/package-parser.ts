import type { Dependency } from "../types/index.js";
import { getWhyExplanation, hasWhyExplanation } from "./why-engine.js";

export interface ParsedProject {
  name: string;
  description: string;
  framework: string;
  language: string;
  dependencies: Dependency[];
}

const frameworkPackages = new Set([
  "next", "react", "react-dom", "vue", "nuxt", "svelte", "@sveltejs/kit",
  "angular", "@angular/core", "express", "fastify", "hono", "remix", "gatsby",
  "astro", "solid-js", "qwik",
]);

const uiPackages = new Set([
  "tailwindcss", "framer-motion", "lucide-react", "react-icons",
  "@radix-ui", "class-variance-authority", "recharts",
]);

const statePackages = new Set([
  "zustand", "jotai", "recoil", "@reduxjs/toolkit", "redux", "mobx",
  "@tanstack/react-query", "swr",
]);

const dbPackages = new Set([
  "prisma", "@prisma/client", "drizzle-orm", "typeorm", "mongoose", "pg",
  "mysql2", "better-sqlite3", "sequelize", "knex",
]);

const authPackages = new Set([
  "@clerk/nextjs", "next-auth", "@auth/core", "passport", "bcrypt",
  "jsonwebtoken", "jose",
]);

const testPackages = new Set([
  "vitest", "jest", "@testing-library/react", "playwright", "cypress",
]);

function categorize(name: string): Dependency["category"] {
  if (frameworkPackages.has(name)) return "framework";
  if (uiPackages.has(name) || name.startsWith("@radix-ui/")) return "ui";
  if (statePackages.has(name)) return "state";
  if (dbPackages.has(name)) return "database";
  if (authPackages.has(name)) return "auth";
  if (testPackages.has(name)) return "testing";
  if (name.startsWith("eslint") || name === "typescript" || name.startsWith("postcss")) return "build";
  if (name === "stripe" || name === "axios" || name.includes("sdk") || name === "cors") return "api";
  return "utility";
}

export function parsePackageJson(content: string): ParsedProject {
  const pkg = JSON.parse(content);
  const deps = pkg.dependencies || {};
  const devDeps = pkg.devDependencies || {};
  const allDeps: Dependency[] = [];

  function addDeps(record: Record<string, string>, isDev: boolean) {
    for (const [name, rawVersion] of Object.entries(record)) {
      const version = typeof rawVersion === "string" ? rawVersion : String(rawVersion);
      const cleanVersion = version.replace(/^[\^~>=<]+/, "");
      const category = categorize(name);

      if (hasWhyExplanation(name)) {
        const why = getWhyExplanation(name);
        allDeps.push({
          id: `dep-${allDeps.length + 1}`,
          name, version: cleanVersion, category: why.category,
          description: why.description, whyChosen: why.whyChosen,
          alternatives: why.alternatives, weeklyDownloads: why.weeklyDownloads,
          license: why.license, isDevDependency: isDev,
        });
      } else {
        allDeps.push({
          id: `dep-${allDeps.length + 1}`,
          name, version: cleanVersion, category,
          description: "", whyChosen: "", alternatives: [],
          weeklyDownloads: 0, license: "", isDevDependency: isDev,
        });
      }
    }
  }

  addDeps(deps, false);
  addDeps(devDeps, true);

  const framework = deps.next ? "Next.js"
    : deps.nuxt ? "Nuxt" : deps.vue ? "Vue"
    : deps["@sveltejs/kit"] ? "SvelteKit" : deps.express ? "Express"
    : deps.fastify ? "Fastify" : deps.react ? "React" : "Unknown";

  const language = (devDeps.typescript || deps.typescript) ? "TypeScript" : "JavaScript";

  return {
    name: pkg.name || "Untitled Project",
    description: pkg.description || "",
    framework, language, dependencies: allDeps,
  };
}
