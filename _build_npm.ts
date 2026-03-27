import { build, emptyDir } from "jsr:@deno/dnt@0.42.3";

const denoJson = JSON.parse(Deno.readTextFileSync("./deno.json"));

await emptyDir("./npm");

await build({
  entryPoints: ["./mod.ts"],
  outDir: "./npm",
  shims: {},
  test: false,
  typeCheck: false,
  skipNpmInstall: true,
  importMap: "./_build_import_map.json",
  filterDiagnostic(diagnostic) {
    const fileName = diagnostic.file?.fileName;
    if (fileName && fileName.includes("@std/assert")) return false;
    return true;
  },
  compilerOptions: {
    lib: ["ES2022", "DOM"],
  },
  package: {
    name: "@tijs/atproto-oauth",
    version: denoJson.version,
    description:
      "Framework-agnostic OAuth integration for AT Protocol (Bluesky) applications using standard Web Request/Response APIs.",
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/tijs/atproto-oauth.git",
    },
    keywords: [
      "atproto",
      "bluesky",
      "oauth",
      "authentication",
    ],
  },
  postBuild() {
    Deno.copyFileSync("LICENSE", "npm/LICENSE");
    Deno.copyFileSync("README.md", "npm/README.md");
  },
});
