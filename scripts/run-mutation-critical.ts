import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

type Mutant = {
  name: string;
  file: string;
  find: string;
  replace: string;
};

const mutants: readonly Mutant[] = [
  {
    name: "allow-remote-model-url",
    file: "src/api-contract.ts",
    find: "localhostHostSchema.safeParse(url.hostname).success",
    replace: "true",
  },
  {
    name: "new-entry-starts-done",
    file: "src/repositories.ts",
    find: 'analysisStatus: "idle",',
    replace: 'analysisStatus: "done",',
  },
  {
    name: "entries-sort-ascending",
    file: "src/repositories.ts",
    find: "ORDER BY created_at DESC",
    replace: "ORDER BY created_at ASC",
  },
  {
    name: "settings-read-wrong-singleton-row",
    file: "src/repositories.ts",
    find: "WHERE id = 1",
    replace: "WHERE id = 2",
  },
];

const survivors: string[] = [];
const errors: string[] = [];

function runTests(mutantName: string): boolean {
  const result = spawnSync("bun", ["test"], {
    encoding: "utf8",
    env: { ...process.env, CODING_STANDARD_MUTATION: mutantName },
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status === 0) {
    return false;
  }

  return true;
}

for (const mutant of mutants) {
  const original = readFileSync(mutant.file, "utf8");

  if (!original.includes(mutant.find)) {
    errors.push(`${mutant.name}: mutation target not found in ${mutant.file}`);
    continue;
  }

  const mutated = original.replace(mutant.find, mutant.replace);

  try {
    writeFileSync(mutant.file, mutated);
    const killed = runTests(mutant.name);
    if (!killed) {
      survivors.push(mutant.name);
    }
  } finally {
    writeFileSync(mutant.file, original);
  }
}

if (errors.length > 0 || survivors.length > 0) {
  console.error(JSON.stringify({ status: "failed", errors, survivors }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", killed: mutants.length }));
