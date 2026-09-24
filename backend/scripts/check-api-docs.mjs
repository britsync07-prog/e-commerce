import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const modulesDir = join(root, "src", "modules");
const docsDir = join(root, "docs", "api");

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const routeFiles = walk(modulesDir).filter((file) => file.endsWith(".routes.ts"));
const missing = routeFiles.filter((file) => {
  const parts = relative(modulesDir, file).split(sep);
  const moduleName = parts[0];
  return !existsSync(join(docsDir, `${moduleName}.md`));
});

if (missing.length) {
  console.error("Missing API docs:");
  for (const file of missing) console.error(`- ${relative(root, file)}`);
  process.exit(1);
}

const requiredSections = [
  "Purpose:",
  "Auth:",
  "Request:",
  "Response:",
  "Side effects:",
  "Audit/timeline:",
  "Cache:",
  "Errors:"
];

const incomplete = [];

for (const file of routeFiles) {
  const moduleName = relative(modulesDir, file).split(sep)[0];
  const docPath = join(docsDir, `${moduleName}.md`);
  const doc = existsSync(docPath) ? readFileSync(docPath, "utf8") : "";
  const missingSections = requiredSections.filter((section) => !doc.includes(section));
  if (missingSections.length) incomplete.push({ docPath, missing: missingSections });
}

if (incomplete.length) {
  console.error("Incomplete API docs:");
  for (const item of incomplete) {
    console.error(`- ${relative(root, item.docPath)} ${item.missing.join(", ")}`);
  }
  process.exit(1);
}

console.log(`API docs check passed for ${routeFiles.length} route file(s).`);
