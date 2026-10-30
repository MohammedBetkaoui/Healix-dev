#!/usr/bin/env node
// Builds the Tauri updater artifacts for a Windows release package:
//
//   node scripts/generate-updater-manifest.mjs [--skip-signatures]
//
// Input: the release package directory (default desktop/release-package),
// containing the normalized, Authenticode-signed installers produced by the
// release workflow (HealixDz-Desktop_<version>_x64-setup.exe and the MSI).
//
// For the NSIS updater payload it computes the minisign signature with the
// release signing key (TAURI_SIGNING_PRIVATE_KEY_PATH or the literal
// TAURI_SIGNING_PRIVATE_KEY, optional TAURI_SIGNING_PRIVATE_KEY_PASSWORD) and
// keeps the .sig next to the file. It then writes:
//
//   latest.json       the updater manifest the desktop app polls; the
//                     windows-x86_64 entry points at the release asset and
//                     carries the signature, verified by the app against the
//                     embedded public key before any installer runs
//   SHA256SUMS.txt    SHA-256 of every package file, computed AFTER signing
//                     (signing rewrites the binaries: never checksum before)
//
// --skip-signatures: unsigned test builds (no release key on the machine)
// checksums only, with an explicit marker; an updater manifest is never
// published without a signature.

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));

const argValue = (name) => {
  const index = process.argv.indexOf(name);
  return index !== -1 ? process.argv[index + 1] : undefined;
};
const skipSignatures = process.argv.includes("--skip-signatures");

const packageDir = join(process.cwd(), argValue("--package-dir") ?? "release-package");
const version = argValue("--version") ?? pkg.version;
const downloadBase =
  argValue("--download-base") ??
  `https://github.com/MohammedBetkaoui/Healix-dev/releases/download/desktop-v${version}`;
const notesFile = argValue("--notes-file");

if (!existsSync(packageDir)) {
  console.error(`Package directory not found: ${packageDir}`);
  process.exit(1);
}

const names = readdirSync(packageDir);
const setup = names.find((name) => /^HealixDz-Desktop_.+_x64-setup\.exe$/i.test(name));
const msi = names.find((name) => /^HealixDz-Desktop_.+_x64_en-US\.msi$/i.test(name));
if (!setup) {
  console.error("No HealixDz-Desktop_*_x64-setup.exe in the package directory.");
  process.exit(1);
}
for (const artifact of [setup, msi].filter(Boolean)) {
  if (!artifact.includes(`_${version}_`)) {
    console.error(`Artifact ${artifact} does not carry the manifest version ${version}.`);
    process.exit(1);
  }
  if (statSync(join(packageDir, artifact)).size === 0) {
    console.error(`Artifact ${artifact} is empty.`);
    process.exit(1);
  }
}

const hashFile = (path) => {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
};

const manifest = {
  version,
  notes: notesFile
    ? readFileSync(notesFile, "utf8").trim() || `HealixDz Desktop ${version}`
    : `HealixDz Desktop ${version}`,
  pub_date: new Date().toISOString(),
  platforms: {},
};

if (!skipSignatures) {
  const keyPath = process.env.TAURI_SIGNING_PRIVATE_KEY_PATH;
  const inlineKey = process.env.TAURI_SIGNING_PRIVATE_KEY;
  if (!keyPath && !inlineKey) {
    console.error(
      "TAURI_SIGNING_PRIVATE_KEY (or TAURI_SIGNING_PRIVATE_KEY_PATH) is missing: refusing to publish an updater package without a cryptographic signature.",
    );
    console.error("  For an unsigned internal test build use --skip-signatures instead.");
    process.exit(1);
  }

  const require = createRequire(import.meta.url);
  const cliPackageDir = dirname(require.resolve("@tauri-apps/cli/package.json"));
  const tauriCli = join(cliPackageDir, "tauri.js");

  let keyFile = keyPath;
  if (!keyFile) {
    keyFile = join(mkdtempSync(join(tmpdir(), "healix-signing-")), "updater.key");
    writeFileSync(keyFile, inlineKey, "utf8");
  } else {
    keyFile = join(process.cwd(), keyPath);
  }

  // childEnv: la clé privée ne doit pas non plus fuiter vers un processus
  // enfant davantage que nécessaire ; on lui passe uniquement le fichier.
  const childEnv = { ...process.env };
  if (inlineKey) delete childEnv.TAURI_SIGNING_PRIVATE_KEY;

  try {
    // Only the NSIS setup is an updater payload: the updater on
    // windows-x86_64 downloads exactly this file, verifies its minisign
    // signature, then runs it. The MSI is a plain release asset.
    const artifact = setup;
    const result = spawnSync(
      process.execPath,
      [tauriCli, "signer", "sign", "-f", keyFile, artifact],
      { cwd: packageDir, env: childEnv, stdio: ["ignore", "inherit", "inherit"] },
    );
    if (result.status !== 0) {
      throw new Error(`tauri signer sign failed for ${artifact} (code ${result.status}).`);
    }
    const signature = readFileSync(join(packageDir, `${artifact}.sig`), "utf8").trim();
    if (!signature.startsWith("dW50cnVzdGVkIGNvbW1lbnQ6")) {
      throw new Error(`Unexpected updater signature for ${artifact}.`);
    }
    manifest.platforms["windows-x86_64"] = {
      signature,
      url: `${downloadBase}/${artifact}`,
    };
    console.log(`Signed ${artifact}: the updater manifest now verifies it.`);
  } finally {
    if (!keyPath) rmSync(dirname(keyFile), { force: true, recursive: true });
  }
}

const output = (name, content) => {
  writeFileSync(join(packageDir, name), content);
  console.log(`Wrote ${join(packageDir, name)}`);
};

if (!skipSignatures) {
  output("latest.json", `${JSON.stringify(manifest, null, 2)}\n`);
}

const checksums = [
  setup,
  msi,
  ...(skipSignatures ? [] : [`${setup}.sig`]),
]
  .filter((name) => existsSync(join(packageDir, name)))
  .sort()
  .map((name) => `${hashFile(join(packageDir, name))}  ${name}`);
output("SHA256SUMS.txt", `${checksums.join("\n")}\n`);

console.log(`Updater artifacts ready (version ${version}${skipSignatures ? ", unsigned test build" : ""}).`);
