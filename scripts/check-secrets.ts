import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const excludedDirectories = new Set([
  ".git",
  "coverage",
  "data",
  "dist",
  "node_modules",
  "reports",
]);

const excludedFiles = new Set([
  ".env",
  "bun.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

const secretPatterns: readonly { name: string; pattern: RegExp }[] = [
  { name: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)?PRIVATE KEY-----/ },
  { name: "openai-key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/ },
  {
    name: "generic-secret-assignment",
    pattern: /(?:api[_-]?key|secret|password|token)\s*=\s*["'][^"'\n]{12,}["']/i,
  },
];

type Finding = {
  file: string;
  line: number;
  pattern: string;
};

function walk(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      if (!excludedDirectories.has(entry)) {
        files.push(...walk(path));
      }
      continue;
    }

    const isBlockedEnvFile = entry.startsWith(".env.") && entry !== ".env.example";
    if (stats.isFile() && !excludedFiles.has(entry) && !isBlockedEnvFile) {
      files.push(path);
    }
  }

  return files;
}

const findings: Finding[] = [];

for (const file of walk(process.cwd())) {
  const content = readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    for (const { name, pattern } of secretPatterns) {
      if (pattern.test(line)) {
        findings.push({ file, line: index + 1, pattern: name });
      }
    }
  }
}

if (findings.length > 0) {
  console.error(JSON.stringify({ status: "failed", findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", findings: 0 }));
