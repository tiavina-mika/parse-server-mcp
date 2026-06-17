import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/bin/cli.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  target: "node18",
});
