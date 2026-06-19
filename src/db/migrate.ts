import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_DB_PATH = resolve(process.cwd(), "data", "journal.sqlite");
const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

export type MigrationRecord = {
  name: string;
  appliedAt: string;
};

/** Opens the SQLite database and applies required safety pragmas. */
export function openDatabase(dbPath = DEFAULT_DB_PATH): Database {
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath, { create: true });
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");

  return db;
}

/** Applies pending SQL migrations once using the schema migration table. */
export function migrate(db: Database, migrationsDir = MIGRATIONS_DIR): void {
  ensureMigrationTable(db);

  if (!existsSync(migrationsDir)) {
    return;
  }

  const applied = new Set(
    db
      .query<MigrationRecord, []>(
        "SELECT name, applied_at as appliedAt FROM schema_migrations ORDER BY name",
      )
      .all()
      .map((row) => row.name),
  );

  const pending = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b))
    .filter((name) => !applied.has(name));

  const applyMigration = db.transaction((name: string, sql: string) => {
    db.exec(sql);
    db.query("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").run(
      name,
      new Date().toISOString(),
    );
  });

  for (const name of pending) {
    const sql = readFileSync(join(migrationsDir, name), "utf8").trim();

    if (!sql) {
      continue;
    }

    applyMigration(name, sql);
  }
}

/** Opens SQLite and applies all pending migrations. */
export function openDatabaseAndMigrate(dbPath = DEFAULT_DB_PATH): Database {
  const db = openDatabase(dbPath);
  migrate(db);
  return db;
}

function ensureMigrationTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
}
