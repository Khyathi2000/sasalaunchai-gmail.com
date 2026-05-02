export interface ClassifiedFile {
  path: string;
  name: string;
  extension: string;
  language: string;
  role: string;
  category: "component" | "page" | "layout" | "api" | "config" | "style" | "test" | "utility" | "type" | "store" | "hook" | "middleware" | "schema" | "asset" | "other";
  linesOfCode: number;
  size: number;
}

const extensionToLanguage: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript (JSX)", ".js": "JavaScript", ".jsx": "JavaScript (JSX)",
  ".css": "CSS", ".scss": "SCSS", ".html": "HTML", ".json": "JSON", ".md": "Markdown",
  ".yml": "YAML", ".yaml": "YAML", ".sql": "SQL", ".prisma": "Prisma", ".graphql": "GraphQL",
  ".py": "Python", ".go": "Go", ".rs": "Rust", ".java": "Java", ".rb": "Ruby",
  ".php": "PHP", ".swift": "Swift", ".kt": "Kotlin", ".dart": "Dart",
  ".vue": "Vue", ".svelte": "Svelte",
};

const pathPatterns: [RegExp, string, ClassifiedFile["category"]][] = [
  [/app\/.*\/page\.(tsx?|jsx?)$/, "Page component", "page"],
  [/app\/.*\/layout\.(tsx?|jsx?)$/, "Layout component", "layout"],
  [/app\/api\/.*\/route\.(ts|js)$/, "API route handler", "api"],
  [/middleware\.(ts|js)$/, "Middleware", "middleware"],
  [/components\//, "Component", "component"],
  [/hooks?\//, "Custom hook", "hook"],
  [/stores?\//, "State store", "store"],
  [/types?\//, "Type definitions", "type"],
  [/lib\/|utils?\//, "Utility module", "utility"],
  [/\.test\.|\.spec\.|__tests__/, "Test file", "test"],
  [/\.css$|\.scss$/, "Stylesheet", "style"],
  [/\.config\.|tsconfig|eslint/, "Configuration", "config"],
  [/prisma\//, "Database schema", "schema"],
  [/public\/|assets\//, "Static asset", "asset"],
];

export function classifyFile(filePath: string, content: string): ClassifiedFile {
  const name = filePath.split("/").pop() || filePath;
  const extMatch = name.match(/\.[^.]+$/);
  const extension = extMatch ? extMatch[0] : "";
  const language = extensionToLanguage[extension] || "Unknown";
  const linesOfCode = content.split("\n").length;
  const size = Buffer.byteLength(content);

  let role = "Source file";
  let category: ClassifiedFile["category"] = "other";

  for (const [pattern, fileRole, fileCategory] of pathPatterns) {
    if (pattern.test(filePath)) {
      role = fileRole;
      category = fileCategory;
      break;
    }
  }

  return { path: filePath, name, extension, language, role, category, linesOfCode, size };
}

export function classifyFiles(files: Map<string, string>): ClassifiedFile[] {
  return Array.from(files.entries()).map(([path, content]) => classifyFile(path, content));
}
