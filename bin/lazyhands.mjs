#!/usr/bin/env node
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const mod = require("../dist/lazyhands.cjs");
if (typeof mod.main === "function") {
  void mod.main().then((code) => {
    if (typeof code === "number") process.exit(code);
  });
}
