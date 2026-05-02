import type { SecurityIssue } from "../types/index.js";

interface ScanInput { path: string; content: string; }

const secretPatterns: { pattern: RegExp; title: string; description: string }[] = [
  { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["'][a-zA-Z0-9_\-]{20,}["']/gi, title: "Hardcoded API Key", description: "An API key appears to be hardcoded." },
  { pattern: /(?:secret|password|passwd|pwd)\s*[:=]\s*["'][^"']{8,}["']/gi, title: "Hardcoded Secret/Password", description: "A secret or password appears to be hardcoded." },
  { pattern: /(?:AKIA[0-9A-Z]{16})/g, title: "AWS Access Key ID", description: "An AWS Access Key ID was detected." },
  { pattern: /(?:ghp_[a-zA-Z0-9]{36})/g, title: "GitHub Personal Access Token", description: "A GitHub token was detected." },
  { pattern: /(?:sk-[a-zA-Z0-9]{20,})/g, title: "Potential API Secret Key", description: "A secret key (sk-...) was detected." },
  { pattern: /(?:-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)/g, title: "Private Key", description: "A private key was found." },
  { pattern: /(?:mongodb\+srv:\/\/[^\s"']+)/gi, title: "MongoDB Connection String", description: "A MongoDB connection string was detected." },
  { pattern: /(?:postgres(?:ql)?:\/\/[^\s"']+)/gi, title: "PostgreSQL Connection String", description: "A PostgreSQL connection string was detected." },
];

const insecurePatterns: { pattern: RegExp; title: string; description: string; severity: SecurityIssue["severity"]; cweId: string }[] = [
  { pattern: /eval\s*\(/g, title: "Use of eval()", description: "eval() executes arbitrary code.", severity: "high", cweId: "CWE-95" },
  { pattern: /innerHTML\s*=/g, title: "Direct innerHTML Assignment", description: "Setting innerHTML can lead to XSS.", severity: "high", cweId: "CWE-79" },
  { pattern: /(?:SELECT|INSERT|UPDATE|DELETE).*\$\{/gi, title: "Potential SQL Injection", description: "String interpolation in SQL queries.", severity: "critical", cweId: "CWE-89" },
  { pattern: /cors\(\s*\)(?!\s*\()/g, title: "Unrestricted CORS", description: "CORS without origin restrictions.", severity: "medium", cweId: "CWE-346" },
  { pattern: /(?:crypto\.createHash\(['"]md5['"]\))/g, title: "Weak Hashing (MD5)", description: "MD5 is cryptographically broken.", severity: "high", cweId: "CWE-328" },
];

const skipPatterns = [/node_modules\//, /\.min\.js$/, /\.map$/, /package-lock\.json$/, /dist\//, /build\//];

function shouldSkip(path: string): boolean {
  return skipPatterns.some((p) => p.test(path));
}

export function scanForSecurityIssues(files: Map<string, string>): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  let issueCount = 0;

  for (const [path, content] of files.entries()) {
    if (shouldSkip(path)) continue;

    for (const { pattern, title, description } of secretPatterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(content);
      if (match) {
        const line = content.substring(0, match.index).split("\n").length;
        issues.push({
          id: `sec-${++issueCount}`, title, description, severity: "critical",
          category: "secret", file: path, line,
          recommendation: "Move this secret to environment variables.", cweId: "CWE-798",
        });
      }
    }

    for (const { pattern, title, description, severity, cweId } of insecurePatterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(content);
      if (match) {
        const line = content.substring(0, match.index).split("\n").length;
        issues.push({
          id: `sec-${++issueCount}`, title, description, severity,
          category: "insecure-pattern", file: path, line,
          recommendation: `Review and fix: ${title}`, cweId,
        });
      }
    }
  }

  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  return issues;
}
