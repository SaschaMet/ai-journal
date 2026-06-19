import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const sourceRoots = ["src"] as const;
const includedExtensions = new Set([".ts", ".tsx"]);
const skippedPatterns = [/\.test\.tsx?$/, /\.d\.ts$/, /\/frontend\/icons\.tsx$/];

type Finding = {
  file: string;
  line: number;
  name: string;
  kind: string;
};

function walk(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      files.push(...walk(path));
      continue;
    }

    if (stats.isFile() && includedExtensions.has(path.slice(path.lastIndexOf(".")))) {
      files.push(path);
    }
  }

  return files;
}

function hasLeadingDocComment(lines: readonly string[], index: number): boolean {
  let cursor = index - 1;

  while (cursor >= 0 && lines[cursor]?.trim() === "") {
    cursor -= 1;
  }

  const previous = lines[cursor]?.trim() ?? "";
  return previous.endsWith("*/") || previous.startsWith("/**") || previous.startsWith("///");
}

function findUndocumentedExports(file: string): Finding[] {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const findings: Finding[] = [];
  const exportPattern = /^export\s+(?:async\s+)?(function|class|interface)\s+([A-Za-z0-9_]+)/;

  for (const [index, line] of lines.entries()) {
    const match = exportPattern.exec(line.trim());
    if (!match) continue;

    const kind = match[1];
    const name = match[2];
    if (!kind || !name || hasLeadingDocComment(lines, index)) continue;

    findings.push({ file, line: index + 1, name, kind });
  }

  return findings;
}

const findings = sourceRoots
  .flatMap((root) => walk(root))
  .filter((file) => !skippedPatterns.some((pattern) => pattern.test(file)))
  .flatMap(findUndocumentedExports);

if (findings.length > 0) {
  console.error(JSON.stringify({ status: "failed", findings }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", findings: 0 }));
