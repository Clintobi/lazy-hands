import * as esbuild from "esbuild";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

await esbuild.build({
  absWorkingDir: root,
  entryPoints: [
    "src/extension/background.ts",
    "src/extension/content.ts",
    "src/extension/offscreen.ts",
    "src/extension/popup.ts",
  ],
  outdir: "extension/dist",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome114",
  logLevel: "info",
});

await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/bridge/cli.ts"],
  outfile: "dist/lazyhands.cjs",
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node20",
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info",
});

const modelsSrc = join(root, "public/models/mediapipe");
const modelsDest = join(root, "extension/models/mediapipe");
if (existsSync(modelsSrc)) {
  mkdirSync(modelsDest, { recursive: true });
  cpSync(modelsSrc, modelsDest, { recursive: true });
}

mkdirSync(join(root, "bin"), { recursive: true });
writeFileSync(
  join(root, "bin/lazyhands.mjs"),
  `#!/usr/bin/env node
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const mod = require("../dist/lazyhands.cjs");
if (typeof mod.main === "function") {
  void mod.main().then((code) => {
    if (typeof code === "number") process.exit(code);
  });
}
`,
);

console.log("extension and lazyhands CLI ready");
