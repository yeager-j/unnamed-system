// Compiles the design system's Tailwind v4 stylesheet to dist/styles.css for
// the design-sync bundle (cfg.cssEntry). Tailwind v4 takes its content sources
// from @source directives in src/styles/sync.css, so no separate config is
// needed. Run via `npm run build:sync`.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const input = join(pkgDir, "src/styles/sync.css");
const output = join(pkgDir, "dist/styles.css");

const css = readFileSync(input, "utf8");
const result = await postcss([tailwind()]).process(css, { from: input, to: output });
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, result.css);
console.error(`  [css] ${(result.css.length / 1024).toFixed(0)} KiB → dist/styles.css`);
