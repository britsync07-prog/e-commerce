import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(process.cwd(), "migrations");
const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
const pattern = /^(\d{3})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;
let failed = false;

if (!files.length) {
  console.error("No migration files found.");
  process.exit(1);
}

files.forEach((file, index) => {
  const match = file.match(pattern);
  const expected = String(index + 1).padStart(3, "0");
  if (!match) {
    console.error(`Invalid migration filename: ${file}`);
    failed = true;
    return;
  }
  if (match[1] !== expected) {
    console.error(`Migration order gap or duplicate: expected ${expected}, got ${match[1]} in ${file}`);
    failed = true;
  }

  const sql = readFileSync(join(migrationsDir, file), "utf8").trim();
  if (!sql) {
    console.error(`Migration is empty: ${file}`);
    failed = true;
  }
});

if (failed) process.exit(1);
console.log(`Migration check passed for ${files.length} file(s).`);
