import { execFileSync } from "node:child_process";
import fs from "node:fs";

// Guards what `npm publish` would ship: the built CLI must be there and match
// the source, and tests and sources must not be. --ignore-scripts so this
// inspects the existing dist/ instead of rebuilding it.
//
// The freshness checks exist because a publish with `ignore-scripts=true` in
// the npm config skips the build: 0.1.0 shipped a dist/ that was older than
// the source. Run via `npm run check:pack`: npm sets npm_execpath, which lets
// us invoke npm without a shell (spawning npm.cmd directly is rejected on
// Windows).
const args = ["pack", "--dry-run", "--json", "--ignore-scripts"];
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error("Run this through `npm run check:pack`.");
  process.exit(1);
}
const out = execFileSync(process.execPath, [npmCli, ...args], { encoding: "utf8" });
const files = JSON.parse(out)[0].files.map((f) => f.path);

const problems = [];
if (!files.includes("dist/cli.js")) problems.push("dist/cli.js is missing (run `npm run build` first)");
for (const f of files) {
  if (/\.test\.js$/.test(f)) problems.push(`test file shipped: ${f}`);
  if (f.startsWith("src/")) problems.push(`source shipped: ${f}`);
}

// Every source module needs a built counterpart that is at least as new.
for (const name of fs.readdirSync("src")) {
  if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
  const built = `dist/${name.replace(/\.ts$/, ".js")}`;
  if (!files.includes(built)) {
    problems.push(`${built} is missing for src/${name} (run \`npm run build\`)`);
  } else if (fs.statSync(built).mtimeMs < fs.statSync(`src/${name}`).mtimeMs - 1000) {
    problems.push(`${built} is older than src/${name} (run \`npm run build\`)`);
  }
}

if (problems.length > 0) {
  console.error(`Tarball check failed:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`Tarball OK (${files.length} files).`);
