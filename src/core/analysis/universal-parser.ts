import type { Dependency } from "../types/index";
import { parsePackageJson, type ParsedProject } from "./package-parser";

export const CONFIG_FILE_CANDIDATES = [
  "package.json", "pyproject.toml", "requirements.txt", "go.mod",
  "Cargo.toml", "pom.xml", "build.gradle", "build.gradle.kts",
  "Gemfile", "composer.json", "*.csproj",
] as const;

export function detectConfigType(filename: string): string {
  const name = filename.toLowerCase().split("/").pop() ?? filename.toLowerCase();
  if (name === "package.json") return "nodejs";
  if (name === "pyproject.toml") return "python";
  if (name === "requirements.txt") return "python";
  if (name === "pipfile") return "python";
  if (name === "go.mod") return "go";
  if (name === "cargo.toml") return "rust";
  if (name === "pom.xml") return "java";
  if (name === "build.gradle" || name === "build.gradle.kts") return "kotlin_java";
  if (name === "gemfile") return "ruby";
  if (name === "composer.json") return "php";
  if (name.endsWith(".csproj") || name.endsWith(".sln")) return "dotnet";
  return "unknown";
}

function makeDep(name: string, ecosystem: string): Dependency {
  return {
    id: `dep-${Math.random().toString(36).slice(2)}`, name, version: "",
    category: "utility", description: `${ecosystem} package`, whyChosen: "",
    alternatives: [], weeklyDownloads: 0, license: "", isDevDependency: false,
  };
}

function parsePyprojectToml(content: string): ParsedProject {
  const name = content.match(/^name\s*=\s*["']([^"']+)["']/m)?.[1] ?? "Python Project";
  const description = content.match(/^description\s*=\s*["']([^"']+)["']/m)?.[1] ?? "";
  const deps: Dependency[] = [];
  const depsSection = content.match(/\[tool\.poetry\.dependencies\]([\s\S]*?)(?=\[|$)/)?.[1]
    ?? content.match(/\[project\]\s*[\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? "";
  const packagePattern = /["']?([a-zA-Z0-9_\-]+)["']?\s*[>=<!^~]/g;
  let match;
  while ((match = packagePattern.exec(depsSection)) !== null) {
    if (match[1] && match[1] !== "python") deps.push(makeDep(match[1], "python"));
  }
  const framework = detectPythonFramework(deps.map(d => d.name));
  return { name, description, framework, language: "Python", dependencies: deps };
}

function parseRequirementsTxt(content: string): ParsedProject {
  const deps: Dependency[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) continue;
    const pkgName = trimmed.split(/[>=<!^~\s[]/)[0].trim();
    if (pkgName) deps.push(makeDep(pkgName, "python"));
  }
  const framework = detectPythonFramework(deps.map(d => d.name));
  return { name: "Python Project", description: "", framework, language: "Python", dependencies: deps };
}

function detectPythonFramework(pkgNames: string[]): string {
  const names = new Set(pkgNames.map(n => n.toLowerCase()));
  if (names.has("fastapi")) return "FastAPI";
  if (names.has("django")) return "Django";
  if (names.has("flask")) return "Flask";
  if (names.has("tornado")) return "Tornado";
  if (names.has("starlette")) return "Starlette";
  return "Python";
}

function parseGoMod(content: string): ParsedProject {
  const moduleLine = content.match(/^module\s+(.+)/m);
  const modulePath = moduleLine?.[1]?.trim() ?? "go-project";
  const name = modulePath.split("/").pop() ?? modulePath;
  const deps: Dependency[] = [];
  const requireBlock = content.match(/require\s*\(([\s\S]*?)\)/)?.[1] ?? "";
  for (const line of requireBlock.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    const parts = trimmed.split(/\s+/);
    if (parts[0]) deps.push(makeDep(parts[0].split("/").slice(-2).join("/"), "go"));
  }
  const framework = detectGoFramework(deps.map(d => d.name));
  return { name, description: "", framework, language: "Go", dependencies: deps };
}

function detectGoFramework(pkgNames: string[]): string {
  const names = pkgNames.join(" ").toLowerCase();
  if (names.includes("gin-gonic/gin")) return "Gin";
  if (names.includes("gofiber/fiber")) return "Fiber";
  if (names.includes("labstack/echo")) return "Echo";
  if (names.includes("go-chi/chi")) return "Chi";
  return "Go";
}

function parseCargoToml(content: string): ParsedProject {
  const name = content.match(/^\[package\][\s\S]*?^name\s*=\s*["']([^"']+)["']/m)?.[1] ?? "Rust Project";
  const description = content.match(/^description\s*=\s*["']([^"']+)["']/m)?.[1] ?? "";
  const deps: Dependency[] = [];
  const depsSection = content.match(/\[dependencies\]([\s\S]*?)(?=\[|$)/)?.[1] ?? "";
  for (const line of depsSection.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("[")) continue;
    const pkgName = trimmed.split(/\s*[=.{]/)[0].trim();
    if (pkgName) deps.push(makeDep(pkgName, "rust"));
  }
  const names = new Set(deps.map(d => d.name.toLowerCase()));
  const framework = names.has("actix-web") ? "Actix Web" : names.has("axum") ? "Axum" : names.has("rocket") ? "Rocket" : "Rust";
  return { name, description, framework, language: "Rust", dependencies: deps };
}

function parsePomXml(content: string): ParsedProject {
  const name = content.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1] ?? "Java Project";
  const description = content.match(/<description>([^<]+)<\/description>/)?.[1] ?? "";
  const deps: Dependency[] = [];
  const depMatches = content.matchAll(/<dependency>[\s\S]*?<artifactId>([^<]+)<\/artifactId>[\s\S]*?<\/dependency>/g);
  for (const m of depMatches) { if (m[1]) deps.push(makeDep(m[1], "java")); }
  const names = deps.map(d => d.name).join(" ").toLowerCase();
  const framework = names.includes("spring-boot") ? "Spring Boot" : names.includes("quarkus") ? "Quarkus" : "Java";
  return { name, description, framework, language: "Java", dependencies: deps };
}

function parseGradle(content: string): ParsedProject {
  const deps: Dependency[] = [];
  const pattern = /(?:implementation|api|compile|runtimeOnly|testImplementation)\s+["']([^"':]+):([^"':]+)/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    deps.push(makeDep(`${match[1].split(".").pop()}:${match[2]}`, "java"));
  }
  const language = content.includes("kotlin") ? "Kotlin" : "Java";
  const names = deps.map(d => d.name).join(" ").toLowerCase();
  const framework = names.includes("spring-boot") ? "Spring Boot" : "Java";
  return { name: "Gradle Project", description: "", framework, language, dependencies: deps };
}

function parseGemfile(content: string): ParsedProject {
  const deps: Dependency[] = [];
  const gemPattern = /^\s*gem\s+["']([^"']+)["']/gm;
  let match;
  while ((match = gemPattern.exec(content)) !== null) { deps.push(makeDep(match[1], "ruby")); }
  const names = new Set(deps.map(d => d.name.toLowerCase()));
  const framework = names.has("rails") ? "Ruby on Rails" : names.has("sinatra") ? "Sinatra" : "Ruby";
  return { name: "Ruby Project", description: "", framework, language: "Ruby", dependencies: deps };
}

function parseComposerJson(content: string): ParsedProject {
  const composer = JSON.parse(content);
  const name = (composer.name as string)?.split("/")[1] ?? composer.name ?? "PHP Project";
  const description = (composer.description as string) ?? "";
  const deps: Dependency[] = [];
  const allRequire = { ...composer.require, ...composer["require-dev"] };
  for (const [pkgName] of Object.entries(allRequire)) {
    if (pkgName !== "php" && !pkgName.startsWith("ext-")) deps.push(makeDep(pkgName, "php"));
  }
  const names = new Set(deps.map(d => d.name.toLowerCase()));
  const framework = names.has("laravel/framework") ? "Laravel" : names.has("symfony/framework-bundle") ? "Symfony" : "PHP";
  return { name, description, framework, language: "PHP", dependencies: deps };
}

function parseCsproj(content: string): ParsedProject {
  const deps: Dependency[] = [];
  const pattern = /<PackageReference\s+Include="([^"]+)"/g;
  let match;
  while ((match = pattern.exec(content)) !== null) { deps.push(makeDep(match[1], "dotnet")); }
  const framework = content.includes("aspnet") ? "ASP.NET Core" : ".NET";
  return { name: "dotnet-project", description: "", framework, language: "C#", dependencies: deps };
}

export function parseAnyConfigFile(filename: string, content: string): ParsedProject {
  const type = detectConfigType(filename);
  switch (type) {
    case "nodejs": return parsePackageJson(content);
    case "python":
      if (filename.toLowerCase() === "requirements.txt") return parseRequirementsTxt(content);
      return parsePyprojectToml(content);
    case "go": return parseGoMod(content);
    case "rust": return parseCargoToml(content);
    case "java":
      if (filename.toLowerCase().includes("pom")) return parsePomXml(content);
      return parseGradle(content);
    case "kotlin_java": return parseGradle(content);
    case "ruby": return parseGemfile(content);
    case "php": return parseComposerJson(content);
    case "dotnet": return parseCsproj(content);
    default:
      return { name: filename.replace(/\.[^.]+$/, "") || "Unknown Project", description: "", framework: "Unknown", language: "Unknown", dependencies: [] };
  }
}
