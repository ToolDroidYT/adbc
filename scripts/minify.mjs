import { build } from "esbuild";
import { readdir } from "fs/promises";

const files = (await readdir("dist")).filter((f) => f.endsWith(".js"));

await Promise.all(
  files.map((f) =>
    build({
      entryPoints: ["dist/" + f],
      outfile: "dist/" + f,
      minify: true,
      platform: "neutral",
      format: "esm",
      bundle: false,
      allowOverwrite: true,
    }),
  ),
);

console.log(`Minified ${files.length} files`);
