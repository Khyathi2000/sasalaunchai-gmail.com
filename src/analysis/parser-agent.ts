import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, basename } from "path";
import type { ParsedCodebase, ParsedFile, FileNode } from "../types/index.js";

const LANGUAGE_MAP: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript (React)", js: "JavaScript", jsx: "JavaScript (React)",
  py: "Python", rb: "Ruby", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin",
  swift: "Swift", cs: "C#", cpp: "C++", c: "C", php: "PHP", vue: "Vue", svelte: "Svelte",
  html: "HTML", css: "CSS", scss: "SCSS", json: "JSON", yaml: "YAML", yml: "YAML",
  toml: "TOML", md: "Markdown", mdx: "MDX", sql: "SQL", sh: "Shell", dockerfile: "Dockerfile",
  graphql: "GraphQL", proto: "Protocol Buffers", xml: "XML", prisma: "Prisma", env: "Env",
};

const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "tiff",
  "mp4", "mp3", "wav", "ogg", "webm", "mov", "avi",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "zip", "tar", "gz", "7z", "rar",
  "woff", "woff2", "ttf", "otf", "eot",
  "lock", "bin", "exe", "dll", "so", "dylib",
]);

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", ".cache",
  "coverage", "__pycache__", ".pytest_cache", "vendor", ".turbo",
  ".vercel", ".netlify", "target", "Pods", ".launch",
]);

function getExtension(filePath: string): string {
  const name = basename(filePath);
  if (name.toLowerCase() === "dockerfile") return "dockerfile";
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

function detectLanguage(filePath: string): string {
  const ext = getExtension(filePath);
  return LANGUAGE_MAP[ext] ?? ext.toUpperCase() ?? "Unknown";
}

function isBinary(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(getExtension(filePath));
}

function shouldSkip(segment: string): boolean {
  return SKIP_DIRS.has(segment);
}

function buildFileTree(paths: string[]): FileNode[] {
  const root: FileNode[] = [];
  const dirMap = new Map<string, FileNode>();
  const sortedPaths = [...paths].sort();

  for (const filePath of sortedPaths) {
    const segments = filePath.split("/");
    let current = root;
    let accumulated = "";

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      accumulated = accumulated ? `${accumulated}/${segment}` : segment;
      const isLast = i === segments.length - 1;

      if (isLast) {
        current.push({
          id: accumulated, name: segment, path: filePath,
          type: "file", language: detectLanguage(filePath),
        });
      } else {
        let dir = dirMap.get(accumulated);
        if (!dir) {
          dir = { id: accumulated, name: segment, path: accumulated, type: "directory", children: [] };
          current.push(dir);
          dirMap.set(accumulated, dir);
        }
        current = dir.children!;
      }
    }
  }
  return root;
}

function detectTechStack(files: ParsedFile[], packageJson?: Record<string, unknown>): string[] {
  const techs = new Set<string>();
  const allDeps: string[] = [];
  if (packageJson) {
    const deps = packageJson.dependencies as Record<string, string> | undefined;
    const devDeps = packageJson.devDependencies as Record<string, string> | undefined;
    if (deps) allDeps.push(...Object.keys(deps));
    if (devDeps) allDeps.push(...Object.keys(devDeps));
  }

  const techDetectors: [string, string][] = [
    ["next", "Next.js"], ["react", "React"], ["vue", "Vue.js"], ["svelte", "Svelte"],
    ["@angular/core", "Angular"], ["express", "Express.js"], ["fastapi", "FastAPI"],
    ["django", "Django"], ["flask", "Flask"], ["@prisma/client", "Prisma ORM"],
    ["typeorm", "TypeORM"], ["mongoose", "Mongoose"], ["@supabase/supabase-js", "Supabase"],
    ["firebase", "Firebase"], ["@clerk/nextjs", "Clerk Auth"], ["stripe", "Stripe"],
    ["tailwindcss", "Tailwind CSS"], ["zustand", "Zustand"], ["redux", "Redux"],
    ["@tanstack/react-query", "TanStack Query"], ["@anthropic-ai/sdk", "Anthropic Claude"],
    ["openai", "OpenAI"], ["typescript", "TypeScript"], ["vitest", "Vitest"],
    ["jest", "Jest"], ["graphql", "GraphQL"], ["docker", "Docker"],
    ["ioredis", "Redis"], ["redis", "Redis"], ["bull", "BullMQ"], ["bullmq", "BullMQ"],
    ["pg", "PostgreSQL"], ["mysql2", "MySQL"], ["@aws-sdk", "AWS SDK"],
    ["socket.io", "Socket.IO"], ["ws", "WebSocket"],
  ];

  for (const dep of allDeps) {
    for (const [pattern, tech] of techDetectors) {
      if (dep === pattern || dep.includes(pattern)) { techs.add(tech); break; }
    }
  }

  const languages = new Set(files.map((f) => detectLanguage(f.path)));
  if (languages.has("Python")) techs.add("Python");
  if (languages.has("Go")) techs.add("Go");
  if (languages.has("Rust")) techs.add("Rust");
  if (languages.has("Ruby")) techs.add("Ruby");
  if (languages.has("Java")) techs.add("Java");

  for (const f of files) {
    const name = f.path.split("/").pop()?.toLowerCase() ?? "";
    if (name === "dockerfile" || name === "docker-compose.yml" || name === "docker-compose.yaml") techs.add("Docker");
    if (name.includes("k8s") || name === "kubernetes.yml") techs.add("Kubernetes");
    if (name.includes("terraform") || name.endsWith(".tf")) techs.add("Terraform");
    if (name === "schema.prisma") techs.add("Prisma ORM");
    if (name === ".env" || name === ".env.example") techs.add("Env Config");
  }

  return Array.from(techs).sort();
}

// ─── Local filesystem parsing ─────────────────────────────────────────

function walkDirectory(dir: string, rootDir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (shouldSkip(entry.name)) continue;
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...walkDirectory(fullPath, rootDir));
    } else if (entry.isFile()) {
      const relPath = relative(rootDir, fullPath).replace(/\\/g, "/");
      if (!isBinary(relPath)) {
        results.push(relPath);
      }
    }
  }
  return results;
}

async function parseLocalCodebase(
  sourcePath: string,
  onProgress: (message: string, fileCount?: number) => void
): Promise<ParsedCodebase> {
  onProgress(`Scanning local directory: ${sourcePath}`);

  const allPaths = walkDirectory(sourcePath, sourcePath);
  onProgress(`Found ${allPaths.length} files. Reading key files...`, allPaths.length);

  // Priority scoring (same logic as GitHub path)
  const priorityPatterns = [
    /package\.json$/, /README/i,
    /^(app|src|lib|pages|components|api|routes|models|controllers|services|utils|hooks|types|config|middleware)\//,
    /\.(ts|tsx|js|jsx|py|go|rs|rb|java|kt|cs|php|prisma|sql|graphql|yaml|yml|toml|tf|Dockerfile)$/i,
  ];

  const scored = allPaths.map((path) => {
    let score = 0;
    for (let i = 0; i < priorityPatterns.length; i++) {
      if (priorityPatterns[i].test(path)) score += (priorityPatterns.length - i) * 10;
    }
    return { path, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const toRead = scored.slice(0, 100);

  const parsedFiles: ParsedFile[] = [];
  for (const { path: relPath } of toRead) {
    try {
      const fullPath = join(sourcePath, relPath);
      const stat = statSync(fullPath);
      if (stat.size > 50_000) continue; // Skip large files

      const content = readFileSync(fullPath, "utf-8");
      parsedFiles.push({
        path: relPath, content,
        language: detectLanguage(relPath), size: stat.size,
      });
    } catch {
      // Skip unreadable files
    }
  }

  const pkgFile = parsedFiles.find((f) => f.path === "package.json");
  let packageJson: Record<string, unknown> | undefined;
  if (pkgFile) {
    try { packageJson = JSON.parse(pkgFile.content); } catch { /* ignore */ }
  }

  const fileTree = buildFileTree(allPaths);
  const techStack = detectTechStack(parsedFiles, packageJson);

  const repoName = basename(sourcePath);
  onProgress(`Parsing complete. Read ${parsedFiles.length} files, detected ${techStack.length} technologies.`);

  return {
    repoName, repoUrl: sourcePath, defaultBranch: "local",
    fileTree, files: parsedFiles, techStack, packageJson,
    totalFiles: allPaths.length, parsedAt: new Date().toISOString(),
  };
}

// ─── GitHub API parsing ───────────────────────────────────────────────

function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  try {
    const cleaned = url.trim().replace(/\.git$/, "");
    const match = cleaned.match(/github\.com[/:]([^/]+)\/([^/]+)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2] };
  } catch { return null; }
}

async function parseGithubCodebase(
  githubUrl: string,
  onProgress: (message: string, fileCount?: number) => void
): Promise<ParsedCodebase> {
  const parsed = parseGithubUrl(githubUrl);
  if (!parsed) throw new Error(`Invalid GitHub URL: ${githubUrl}`);

  const { owner, repo } = parsed;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  onProgress(`Connecting to GitHub: ${owner}/${repo}`);
  const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
  if (!repoRes.ok) {
    if (repoRes.status === 404) throw new Error(`Repository not found: ${owner}/${repo}`);
    if (repoRes.status === 403) throw new Error("GitHub rate limit exceeded. Set GITHUB_TOKEN.");
    throw new Error(`GitHub API error: ${repoRes.status}`);
  }
  const repoInfo = await repoRes.json() as { default_branch: string; name: string };
  const defaultBranch = repoInfo.default_branch ?? "main";

  onProgress(`Fetching file tree from branch: ${defaultBranch}`);
  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`,
    { headers }
  );
  if (!treeRes.ok) throw new Error(`Failed to fetch file tree: ${treeRes.status}`);
  const treeData = await treeRes.json() as { tree: { path: string; type: string; size?: number; sha: string }[] };

  const fileItems = treeData.tree.filter(
    (item) => item.type === "blob" && !item.path.split("/").some(shouldSkip) && !isBinary(item.path)
  );

  onProgress(`Found ${fileItems.length} files. Fetching key files...`, fileItems.length);

  const priorityPatterns = [
    /package\.json$/, /README/i,
    /^(app|src|lib|pages|components|api|routes|models|controllers|services)\//,
    /\.(ts|tsx|js|jsx|py|go|rs|rb|java|kt|prisma|sql|yaml|yml|toml|tf|Dockerfile)$/i,
  ];

  const scored = fileItems.map((item) => {
    let score = 0;
    for (let i = 0; i < priorityPatterns.length; i++) {
      if (priorityPatterns[i].test(item.path)) score += (priorityPatterns.length - i) * 10;
    }
    return { item, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const toFetch = scored.slice(0, 80).map((s) => s.item);

  const parsedFiles: ParsedFile[] = [];
  const batchSize = 10;

  for (let i = 0; i < toFetch.length; i += batchSize) {
    const batch = toFetch.slice(i, i + batchSize);
    onProgress(`Reading files ${i + 1}-${Math.min(i + batchSize, toFetch.length)} of ${toFetch.length}...`);

    const results = await Promise.allSettled(
      batch.map(async (item) => {
        const res = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${item.path}?ref=${defaultBranch}`,
          { headers }
        );
        if (!res.ok) return null;
        const data = await res.json() as { content?: string; encoding?: string };
        if (!data.content || data.encoding !== "base64") return null;
        const content = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8");
        if (content.length > 50_000) return null;
        return { path: item.path, content, language: detectLanguage(item.path), size: item.size ?? content.length } satisfies ParsedFile;
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) parsedFiles.push(result.value);
    }
  }

  const pkgFile = parsedFiles.find((f) => f.path === "package.json" || f.path.endsWith("/package.json"));
  let packageJson: Record<string, unknown> | undefined;
  if (pkgFile) { try { packageJson = JSON.parse(pkgFile.content); } catch { /* ignore */ } }

  const allFilePaths = fileItems.map((f) => f.path);
  const fileTree = buildFileTree(allFilePaths);
  const techStack = detectTechStack(parsedFiles, packageJson);

  onProgress(`Complete. Fetched ${parsedFiles.length} files, detected ${techStack.length} technologies.`);

  return {
    repoName: `${owner}/${repo}`, repoUrl: githubUrl, defaultBranch,
    fileTree, files: parsedFiles, techStack, packageJson,
    totalFiles: fileItems.length, parsedAt: new Date().toISOString(),
  };
}

// ─── Main entry point ─────────────────────────────────────────────────

export type ParserProgressCallback = (message: string, fileCount?: number) => void;

function isGithubUrl(source: string): boolean {
  return source.startsWith("http") && source.includes("github.com");
}

export async function runParserAgent(
  source: string,
  onProgress: ParserProgressCallback
): Promise<ParsedCodebase> {
  if (isGithubUrl(source)) {
    return parseGithubCodebase(source, onProgress);
  } else {
    return parseLocalCodebase(source, onProgress);
  }
}
