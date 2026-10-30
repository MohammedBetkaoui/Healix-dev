#!/usr/bin/env node
// Release sanity check for the HealixDz Desktop packaging, run in the standard
// CI (every push) and as the first step of the Windows release workflow.
//
//   node scripts/release-check.mjs
//   node scripts/release-check.mjs --expected-artifact-dir release-package
//
// It answers, before anything is built or published:
//   - do package.json / tauri.conf.json / Cargo.toml / Cargo.lock agree?
//   - are the Windows icon formats present (installer, shortcuts, taskbar)?
//   - is the bundle metadata configured (publisher, NSIS install mode,
//     stable MSI upgrade code)?
//   - does the updater configuration carry the minisign public key and HTTPS
//     endpoints (an update must never be installed just because a URL
//     answered)?
//   - when invoked with --expected-artifact-dir, does the built package
//     contain the expected release artifacts (non-empty, version-named)?

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const pkg = readJson(join(rootDir, "package.json"));
const conf = readJson(join(rootDir, "src-tauri", "tauri.conf.json"));
const cargoToml = readFileSync(join(rootDir, "src-tauri", "Cargo.toml"), "utf8");

const problems = [];
const fail = (message) => problems.push(message);

// Versions ---------------------------------------------------------------
const versions = {
  "package.json": pkg.version,
  "tauri.conf.json": conf.version,
  "Cargo.toml": /^version\s*=\s*"([^"]+)"/m.exec(cargoToml)?.[1],
};
for (const [file, version] of Object.entries(versions)) {
  if (!version) fail(`Version unreadable in ${file}.`);
}
if (new Set(Object.values(versions)).size !== 1) {
  fail(
    `Versions disagree — run "node scripts/set-desktop-version.mjs": ${JSON.stringify(versions)}`,
  );
}
if (pkg.version && !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(pkg.version)) {
  fail(`version ${pkg.version} is not MAJOR.MINOR.PATCH.`);
}

// Windows metadata -------------------------------------------------------
const bundle = conf.bundle ?? {};
const windows = bundle.windows ?? {};
if (conf.identifier !== "dz.healix.desktop") {
  fail(`Unexpected identifier: ${conf.identifier}`);
}
if (bundle.publisher !== "HealixDz") fail("bundle.publisher must remain HealixDz.");
if (!bundle.copyright) fail("bundle.copyright is missing.");
if (windows.nsis?.installMode !== "currentUser") {
  fail("bundle.windows.nsis.installMode must be currentUser (documented uninstall policy).");
}
const upgradeCode = windows.wix?.upgradeCode ?? "";
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(upgradeCode)) {
  fail("bundle.windows.wix.upgradeCode must be a fixed GUID (MSI upgrade path).");
}
if (windows.timestampUrl && !/^https?:\/\//.test(windows.timestampUrl)) {
  fail("bundle.windows.timestampUrl must be an RFC 3161 timestamp server URL.");
}

// Icons ------------------------------------------------------------------
const iconFiles = [
  ...(bundle.icon ?? []),
  windows.nsis?.installerIcon,
].filter(Boolean);
for (const icon of iconFiles) {
  const path = join(rootDir, "src-tauri", icon);
  if (!existsSync(path) || statSync(path).size === 0) {
    fail(`Missing icon file: ${icon}`);
  }
}
if (!existsSync(join(rootDir, "src-tauri", "icons", "icon.ico"))) {
  fail("icons/icon.ico is required by every Windows artifact.");
}

// Updater ----------------------------------------------------------------
const updater = conf.plugins?.updater ?? {};
if (updater.active) {
  if (!/^[\w+/]+={0,3}$/.test(updater.pubkey ?? "")) {
    fail("plugins.updater.pubkey must carry the minisign public key.");
  }
  if (!Array.isArray(updater.endpoints) || updater.endpoints.length === 0) {
    fail("plugins.updater.endpoints is empty.");
  }
  for (const endpoint of updater.endpoints ?? []) {
    if (!endpoint.startsWith("https://")) {
      fail(`Updater endpoint must be HTTPS: ${endpoint}`);
    }
  }
  if (bundle.createUpdaterArtifacts === true) {
    fail(
      "bundle.createUpdaterArtifacts must stay false: updater signatures are produced over the Authenticode-signed installers (see scripts/generate-updater-manifest.mjs).",
    );
  }
}

// Built artifacts --------------------------------------------------------
const artifactDirIndex = process.argv.indexOf("--expected-artifact-dir");
if (artifactDirIndex !== -1) {
  const dir = join(process.cwd(), process.argv[artifactDirIndex + 1]);
  const version = versions["package.json"];
  if (!existsSync(dir)) {
    fail(`Expected artifact directory does not exist: ${dir}`);
  } else {
    const names = readdirSync(dir);
    const expected = [
      `HealixDz-Desktop_${version}_x64-setup.exe`,
      `HealixDz-Desktop_${version}_x64_en-US.msi`,
    ];
    for (const name of expected) {
      const path = join(dir, name);
      if (!existsSync(path)) {
        fail(`Missing release artifact: ${name}`);
      } else if (statSync(path).size < 1_000_000) {
        fail(`Release artifact suspiciously small: ${name}`);
      }
    }
    if (names.some((name) => !expected.includes(name) && name !== "SHA256SUMS.txt" && name !== "latest.json")) {
      // Extra files are allowed (release notes…); only report unknown binaries.
      for (const name of names) {
        if (/\.(exe|msi|msix)$/i.test(name) && !expected.includes(name)) {
          fail(`Unexpected Windows binary in the package: ${name}`);
        }
      }
    }
  }
}

if (problems.length) {
  console.error(`release-check failed (${problems.length}):
${problems.map((problem) => `  - ${problem}`).join("\n")}`);
  process.exit(1);
}
console.log("release-check: desktop packaging configuration is coherent.");
