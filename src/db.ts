import { resolve } from "node:path";
import { openDatabaseAndMigrate } from "./db/migrate";

// import.meta.dir is inlined at compile time with the source file's directory,
// so this resolves correctly both in `bun dev` (src/) and `cd dist && bun server.js` (src/).
export const DATABASE_PATH = resolve(import.meta.dir, "..", "data", "journal.sqlite");

export const db = openDatabaseAndMigrate(DATABASE_PATH);
