import type { ClassifiedFile } from "./file-classifier.js";
import type { ParsedDependency } from "./dependency-parser.js";
import type { ArchitectureDiagram } from "../types/index.js";

export function generateDiagrams(
  files: ClassifiedFile[],
  deps: ParsedDependency[],
  projectName: string
): ArchitectureDiagram[] {
  return [
    generateComponentDiagram(files, projectName),
    generateDependencyGraph(deps),
  ];
}

function generateComponentDiagram(files: ClassifiedFile[], projectName: string): ArchitectureDiagram {
  const pages = files.filter((f) => f.category === "page");
  const components = files.filter((f) => f.category === "component");
  const apis = files.filter((f) => f.category === "api");

  let mermaid = `graph TD\n`;
  mermaid += `  Client[Client Browser]\n`;
  mermaid += `  App[${projectName}]\n`;
  mermaid += `  Client --> App\n\n`;

  if (pages.length > 0) {
    mermaid += `  subgraph Pages\n`;
    pages.slice(0, 8).forEach((p, i) => {
      mermaid += `    P${i}[${p.name.replace(/\.(tsx?|jsx?)$/, "")}]\n`;
    });
    mermaid += `  end\n`;
    mermaid += `  App --> Pages\n\n`;
  }

  if (components.length > 0) {
    mermaid += `  subgraph Components\n`;
    components.slice(0, 8).forEach((c, i) => {
      mermaid += `    C${i}[${c.name.replace(/\.(tsx?|jsx?)$/, "")}]\n`;
    });
    mermaid += `  end\n`;
    if (pages.length > 0) mermaid += `  Pages --> Components\n\n`;
  }

  if (apis.length > 0) {
    mermaid += `  subgraph API\n`;
    apis.slice(0, 6).forEach((a, i) => {
      mermaid += `    A${i}[/${a.path.replace(/.*api\//, "").replace(/\/route\.(ts|js)$/, "")}]\n`;
    });
    mermaid += `  end\n`;
    mermaid += `  Pages --> API\n`;
  }

  return {
    id: "diag-component", title: "Component Architecture",
    description: "High-level view of pages, components, and API routes",
    type: "component", mermaidCode: mermaid,
  };
}

function generateDependencyGraph(deps: ParsedDependency[]): ArchitectureDiagram {
  const prodDeps = deps.filter((d) => !d.isDevDependency).slice(0, 12);
  const devDeps = deps.filter((d) => d.isDevDependency).slice(0, 8);

  let mermaid = `graph LR\n`;
  mermaid += `  App((Project))\n\n`;

  if (prodDeps.length > 0) {
    mermaid += `  subgraph Production\n`;
    prodDeps.forEach((d, i) => { mermaid += `    D${i}[${d.name}]\n`; });
    mermaid += `  end\n`;
    prodDeps.forEach((_, i) => { mermaid += `  App --> D${i}\n`; });
  }

  if (devDeps.length > 0) {
    mermaid += `\n  subgraph Development\n`;
    devDeps.forEach((d, i) => { mermaid += `    V${i}[${d.name}]\n`; });
    mermaid += `  end\n`;
    devDeps.forEach((_, i) => { mermaid += `  App -.-> V${i}\n`; });
  }

  return {
    id: "diag-deps", title: "Dependency Graph",
    description: "Production and development dependencies",
    type: "dependency", mermaidCode: mermaid,
  };
}
