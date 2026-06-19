import { execFileSync } from "node:child_process";

const strict = process.env.CODING_STANDARD_STRICT === "1" || process.argv.includes("--strict");
const base = process.env.CODING_STANDARD_BASE_REF ?? "origin/main";

type Finding = {
  file: string;
  line: string;
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

const rawDiff = git(["diff", "--no-ext-diff", "--unified=0", `${base}...HEAD`]);
if (rawDiff === null) {
  console.log(JSON.stringify({ status: "skipped", reason: "git diff base unavailable", base }));
  process.exit(0);
}
const diff = rawDiff;

const changedFiles =
  git(["diff", "--name-only", `${base}...HEAD`])
    ?.split(/\r?\n/)
    .filter(Boolean) ?? [];

const productionFiles = changedFiles.filter(
  (file) =>
    file.startsWith("src/") && /\.(ts|tsx)$/.test(file) && !/\.(test|spec)\.(ts|tsx)$/.test(file),
);
const testFiles = changedFiles.filter((file) => /\.(test|spec)\.(ts|tsx)$/.test(file));

const findings: Finding[] = [];
let currentFile = "";

for (const line of diff.split(/\r?\n/)) {
  if (line.startsWith("+++ b/")) {
    currentFile = line.slice("+++ b/".length);
    continue;
  }

  if (!line.startsWith("+") || line.startsWith("+++")) {
    continue;
  }

  const added = line.slice(1);
  const checks: readonly { reason: string; pattern: RegExp }[] = [
    {
      reason: "broad type or type escape hatch",
      pattern: /\b(any|unknown|object)\b|as\s+(?:any|unknown)\b|@ts-(?:ignore|expect-error)/,
    },
    {
      reason: "lint, formatter, typecheck, or broad ignore waiver",
      pattern:
        /eslint-disable|biome-ignore|prettier-ignore|@ts-(?:ignore|expect-error)|typecheck.*false|skipLibCheck.*true/,
    },
    {
      reason: "weakened assertion",
      pattern: /\.toBeTruthy\(\)|\.toBeDefined\(\)|expect\.anything\(\)|expect\.any\(/,
    },
    { reason: "focused or skipped test", pattern: /\b(?:describe|test|it)\.(?:only|skip)\(/ },
    {
      reason: "snapshot churn requires behavioral justification",
      pattern: /toMatchSnapshot|__snapshots__/,
    },
  ];

  for (const check of checks) {
    if (check.pattern.test(added)) {
      findings.push({ file: currentFile, line: added.trim(), reason: check.reason });
    }
  }
}

if (testFiles.length > 0 && productionFiles.length === 0) {
  findings.push({
    file: testFiles.join(","),
    line: "",
    reason: "test-only change; verify this is not masking a production bug",
  });
}

if (findings.length > 0) {
  const payload = { status: strict ? "failed" : "warning", base, findings };
  console.error(JSON.stringify(payload, null, 2));
  process.exit(strict ? 1 : 0);
}

console.log(JSON.stringify({ status: "passed", base, findings: 0 }));
