// Converts the upstream dz metadata into a compact HealixDz data module.
// Usage: node scripts/extract-dz-map.mjs
import { readFileSync, writeFileSync } from "node:fs";

const SRC = "C:\\Users\\HP\\AppData\\Local\\Temp\\opencode\\dz-metadata.ts";
const DEST = "src/components/landing/algeria-wilayas.ts";

const text = readFileSync(SRC, "utf8");

function extractBlock(key) {
  const start = text.indexOf(key + ":");
  if (start === -1) throw new Error(`missing ${key}`);
  const open = text.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced ${key}`);
}

const pathsBlock = extractBlock("paths");
const namesBlock = extractBlock("names");
const bboxBlock = extractBlock("state_bbox_array");

const paths = {};
for (const m of pathsBlock.matchAll(/([A-Z]{2}\d{2}):\s*"((?:[^"\\]|\\.)*)"/g)) {
  paths[m[1]] = m[2];
}
const names = {};
for (const m of namesBlock.matchAll(/([A-Z]{2}\d{2}):\s*"([^"]*)"/g)) {
  names[m[1]] = m[2];
}
const centers = {};
for (const m of bboxBlock.matchAll(/([A-Z]{2}\d{2}):\{([^}]*)\}/g)) {
  const cx = /cx:"?([\d.]+)"?/.exec(m[2]);
  const cy = /cy:"?([\d.]+)"?/.exec(m[2]);
  if (cx && cy) centers[m[1]] = { x: Number(cx[1]), y: Number(cy[1]) };
}

const ids = Object.keys(paths).sort();
console.log("paths:", ids.length);
console.log("names:", Object.keys(names).length);
console.log("centers:", Object.keys(centers).length);
const missingNames = ids.filter((id) => !names[id]);
const missingCenters = ids.filter((id) => !centers[id]);
console.log("missing names:", missingNames);
console.log("missing centers:", missingCenters);
if (ids.length !== 58) throw new Error("expected 58 wilayas");
console.log("DZ16:", names.DZ16, centers.DZ16);
console.log("DZ31:", names.DZ31, centers.DZ31);
console.log("DZ25:", names.DZ25, centers.DZ25);

const out = `// Algeria wilaya SVG geometries adapted from anisbl/map_of_algeria
// (https://github.com/anisbl/map_of_algeria) — viewBox "0 0 1000 1000".
// Only geometry + display names are reused; styling stays HealixDz.

export const WILAYA_PATHS: Record<string, string> = ${JSON.stringify(paths, null, 2)};

export const WILAYA_NAMES: Record<string, string> = ${JSON.stringify(names, null, 2)};

export const WILAYA_CENTERS: Record<string, { x: number; y: number }> = ${JSON.stringify(centers)};

/** Wilayas highlighted on the institutional map: Alger, Oran, Constantine. */
export const HIGHLIGHTED_WILAYAS: readonly string[] = ["DZ16", "DZ31", "DZ25"];
`;

writeFileSync(DEST, out, "utf8");
console.log("written", DEST, out.length, "chars");
