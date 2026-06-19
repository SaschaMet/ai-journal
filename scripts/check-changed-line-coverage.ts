import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const strict = process.env.CODING_STANDARD_STRICT === "1" || process.argv.includes("--strict");
const base = process.env.CODING_STANDARD_BASE_REF ?? "origin/main";
const lcovPath: string = process.argv[2] ?? "coverage/lcov.info";

type ChangedLine = {
  file: string;
  line: number;
};

type Finding = ChangedLine & {
  reason: string;
};

function git(args: readonly string[]): string | null {
  try {
    return execFileSync("git", [...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function parseChangedLines(diff: string): ChangedLine[] {
  const changedLines: ChangedLine[] = [];
  let currentFile = "";
  let currentNewLine = 0;

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice("+++ b/".length);
      continue;
    }

    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    const hunkStart = hunk?.[1];
    if (hunkStart) {
      currentNewLine = Number(hunkStart);
      continue;
    }

    if (!currentFile || !currentNewLine) {
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      if (
        /^src\/.*\.(ts|tsx)$/.test(currentFile) &&
        !/\.(test|spec)\.(ts|tsx)$/.test(currentFile)
      ) {
        changedLines.push({ file: currentFile, line: currentNewLine });
      }
      currentNewLine += 1;
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      continue;
    }

    currentNewLine += 1;
  }

  return changedLines;
}

function parseCoveredLines(lcov: string): Map<string, Set<number>> {
  const covered = new Map<string, Set<number>>();
  let currentFile = "";

  for (const line of lcov.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      const path = line.slice(3);
      currentFile = relative(process.cwd(), resolve(path));
      covered.set(currentFile, new Set<number>());
      continue;
    }

    const record = /^DA:(\d+),(\d+)/.exec(line);
    const lineNumber = record?.[1];
    const hitCount = record?.[2];
    if (lineNumber && hitCount && currentFile && Number(hitCount) > 0) {
      covered.get(currentFile)?.add(Number(lineNumber));
    }
  }

  return covered;
}

const rawDiff = git(["diff", "--no-ext-diff", "--unified=0", `${base}...HEAD`, "--", "src"]);
if (rawDiff === null) {
  console.log(JSON.stringify({ status: "skipped", reason: "git diff base unavailable", base }));
  process.exit(0);
}
const diff = rawDiff;

const changedLines = parseChangedLines(diff);
if (changedLines.length === 0) {
  console.log(JSON.stringify({ status: "passed", reason: "no changed production lines", base }));
  process.exit(0);
}

if (!existsSync(lcovPath)) {
  const payload = {
    status: strict ? "failed" : "warning",
    reason: "coverage/lcov.info missing",
    base,
  };
  console.error(JSON.stringify(payload, null, 2));
  process.exit(strict ? 1 : 0);
}

const covered = parseCoveredLines(readFileSync(lcovPath, "utf8"));
const findings: Finding[] = [];

for (const changed of changedLines) {
  if (!covered.get(changed.file)?.has(changed.line)) {
    findings.push({ ...changed, reason: "changed production line is not covered" });
  }
}

if (findings.length > 0) {
  const payload = { status: strict ? "failed" : "warning", base, findings };
  console.error(JSON.stringify(payload, null, 2));
  process.exit(strict ? 1 : 0);
}

console.log(JSON.stringify({ status: "passed", base, changedLines: changedLines.length }));
