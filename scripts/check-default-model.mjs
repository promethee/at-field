// Monthly health check for the default expansion model (see
// .github/workflows/model-check.yml). Fails when the model's tag has gone from
// the Ollama registry, when the size lookup stops parsing, or when the size
// written in the README and on the page has drifted from the registry's.
// Run: npm run check:model
import { DEFAULT_MODEL } from "../src/theme.ts";
import { lookupModel, formatSize } from "../src/registry.ts";

// The size stated in README.md and docs/index.html. Update all three together.
const DOCUMENTED_GB = 1.9;
const TOLERANCE = 0.15;

const result = await lookupModel(DEFAULT_MODEL, 15000);
if (!result.ok) {
  console.error(`FAIL: default model "${DEFAULT_MODEL}": ${result.reason}`);
  console.error("Installing at-field as documented would break. Pick a new default or fix the lookup.");
  process.exit(1);
}

const gb = result.bytes / 1e9;
console.log(`Default model "${DEFAULT_MODEL}" is on the registry: ${formatSize(result.bytes)}.`);

if (Math.abs(gb - DOCUMENTED_GB) / DOCUMENTED_GB > TOLERANCE) {
  console.error(
    `FAIL: the docs say about ${DOCUMENTED_GB} GB (README.md, docs/index.html) but the registry says ${gb.toFixed(2)} GB. ` +
      `Update the docs and DOCUMENTED_GB in this script.`,
  );
  process.exit(1);
}
console.log("Documented size still matches.");
