import type { Dependency } from "../types/index.js";
import { getWhyExplanation } from "./why-engine.js";

export interface ParsedDependency {
  name: string;
  version: string;
  isDevDependency: boolean;
}

export function parseDependenciesFromPackageJson(content: string): {
  projectName: string;
  projectDescription: string;
  dependencies: ParsedDependency[];
} {
  const pkg = JSON.parse(content);
  const deps: ParsedDependency[] = [];

  if (pkg.dependencies) {
    for (const [name, version] of Object.entries(pkg.dependencies)) {
      deps.push({ name, version: (version as string).replace(/[\^~]/, ""), isDevDependency: false });
    }
  }
  if (pkg.devDependencies) {
    for (const [name, version] of Object.entries(pkg.devDependencies)) {
      deps.push({ name, version: (version as string).replace(/[\^~]/, ""), isDevDependency: true });
    }
  }

  return {
    projectName: pkg.name || "unknown",
    projectDescription: pkg.description || "",
    dependencies: deps,
  };
}

export function enrichDependencies(parsed: ParsedDependency[]): Dependency[] {
  return parsed.map((dep, index) => {
    const why = getWhyExplanation(dep.name);
    return {
      id: `dep-${index}`,
      name: dep.name, version: dep.version,
      category: why.category, description: why.description,
      whyChosen: why.whyChosen, alternatives: why.alternatives,
      weeklyDownloads: why.weeklyDownloads, license: why.license,
      isDevDependency: dep.isDevDependency,
    };
  });
}
