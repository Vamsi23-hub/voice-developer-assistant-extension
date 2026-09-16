import * as esbuild from "esbuild";

const production = process.argv.includes("--production");

const builds = [
  {
    entryPoints: ["helpers/stt/main.ts"],
    outfile: "dist-helper/stt.mjs",
    external: ["sherpa-onnx-node"],
  },
  {
    entryPoints: ["helpers/voice/main.ts"],
    outfile: "dist-helper/voice.mjs",
    external: ["sherpa-onnx-node", "node-cpal"],
  },
];

for (const build of builds) {
  const result = await esbuild.build({
    entryPoints: build.entryPoints,
    bundle: true,
    format: "esm",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outfile: build.outfile,
    external: build.external,
    logLevel: "info",
  });
  if (result.errors.length > 0) {
    process.exit(1);
  }
}
