import { readdirSync, statSync, existsSync } from "node:fs";
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

console.log(`API docs check passed for ${routeFiles.length} route file(s).`);

