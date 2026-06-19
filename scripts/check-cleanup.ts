import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const strict = process.env.CODING_STANDARD_STRICT === "1" || process.argv.includes("--strict");
const forbiddenTrackedPatterns = [
  /^dist\//,
  /^coverage\//,
  /^reports\//,
  /^data\/.*\.sqlite(?:-.+)?$/,
];
const generatedRoots = ["dist", "coverage", "reports"];

type Finding = {
  path: string;
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

function walk(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }

  const paths: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stats = statSync(path);
    paths.push(path);
    if (stats.isDirectory()) {
      paths.push(...walk(path));
    }
  }
  return paths;
}

const findings: Finding[] = [];
const tracked = git(["ls-files"]);

if (tracked !== null) {
  for (const path of tracked.split(/\r?\n/).filter(Boolean)) {
    if (forbiddenTrackedPatterns.some((pattern) => pattern.test(path))) {
      findings.push({ path, reason: "generated or local data file is tracked" });
    }
  }
}

for (const root of generatedRoots) {
  for (const path of walk(root)) {
    if (tracked?.includes(`${path}\n`) !== true) {
      continue;
    }
    findings.push({ path, reason: "generated artifact should not be committed" });
  }
}

if (findings.length > 0) {
  const payload = { status: strict ? "failed" : "warning", findings };
  console.error(JSON.stringify(payload, null, 2));
  process.exit(strict ? 1 : 0);
}

console.log(JSON.stringify({ status: "passed", findings: 0 }));
