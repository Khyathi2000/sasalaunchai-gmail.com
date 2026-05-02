// Re-export sub-modules
export * from "./plan.js";
export * from "./cloud.js";
export * from "./events.js";

// Types adapted from Sakura AI for code analysis

export interface ParsedFile {
  path: string;
  content: string;
  language: string;
  size: number;
}

export interface FileNode {
  id: string;
  name: string;
  path: string;
  type: "file" | "directory";
  language?: string;
  size?: number;
  linesOfCode?: number;
  description?: string;
  children?: FileNode[];
}

export interface ParsedCodebase {
  repoName: string;
  repoUrl: string;
  defaultBranch: string;
  fileTree: FileNode[];
  files: ParsedFile[];
  techStack: string[];
  packageJson?: Record<string, unknown>;
  totalFiles: number;
  parsedAt: string;
}

export interface FileExplanation {
  path: string;
  role: string;
  explanation: string;
  keyExports: string[];
  connects: string[];
  patterns: string[];
  complexity: "simple" | "medium" | "complex";
}

export interface TechConsideration {
  name: string;
  purpose: string;
  whyChosen: string;
  alternative?: string;
}

export interface AnalysisResult {
  repoName: string;
  summary: string;
  flowchart: string;
  fileExplanations: FileExplanation[];
  techConsiderations: TechConsideration[];
  infraRequirements?: import("./plan.js").InfraRequirements;
  analyzedAt: string;
}

export interface Dependency {
  id: string;
  name: string;
  version: string;
  category: "framework" | "ui" | "state" | "utility" | "build" | "testing" | "database" | "auth" | "api";
  description: string;
  whyChosen: string;
  alternatives: { name: string; description: string; pros: string[]; cons: string[] }[];
  weeklyDownloads: number;
  license: string;
  isDevDependency: boolean;
}

export interface SecurityIssue {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  category: "vulnerability" | "secret" | "insecure-pattern";
  file: string;
  line?: number;
  recommendation: string;
  cweId?: string;
}

export interface ArchitectureDiagram {
  id: string;
  title: string;
  description: string;
  type: "component" | "data-flow" | "dependency" | "sequence";
  mermaidCode: string;
}
