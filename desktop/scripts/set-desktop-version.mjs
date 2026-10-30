#!/usr/bin/env node
// Single source of truth for the HealixDz Desktop version: desktop/package.json.
//
//   node scripts/set-desktop-version.mjs              -> verify the sync only
//   node scripts/set-desktop-version.mjs 0.2.0        -> apply 0.2.0 everywhere
//   node scripts/set-desktop-version.mjs 0.2.0 --check
//                                                     -> fail when out of sync
//
// The four files that carry the desktop version:
//   desktop/package.json              "version"
//   desktop/src-tauri/tauri.conf.json "version" (stamped into installers and app metadata)
//   desktop/src-tauri/Cargo.toml      package version
//   desktop/src-tauri/Cargo.lock      the healixdz-desktop entry
//
// A release tag is desktop-vX.Y.Z and must match; the release workflow calls
// this script with --check before anything builds.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

const PACKAGE_JSON = join(rootDir, "package.json");
const TAURI_CONF = join(rootDir, "src-tauri", "tauri.conf.json");
const CARGO_TOML = join(rootDir, "src-tauri", "Cargo.toml");
const CARGO_LOCK = join(rootDir, "src-tauri", "Cargo.lock");

const SEMVER = /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/;

const versions = {
  "package.json": /"version"\s*:\s*"([^"]+)"/.exec(readFileSync(PACKAGE_JSON, "utf8"))?.[1],
  "tauri.conf.json": /"version"\s*:\s*"([^"]+)"/.exec(readFileSync(TAURI_CONF, "utf8"))?.[1],
  "Cargo.toml": /^version\s*=\s*"([^"]+)"/m.exec(readFileSync(CARGO_TOML, "utf8"))?.[1],
  "Cargo.lock": /name = "healixdz-desktop"\r?\nversion = "([^"]+)"/.exec(
    readFileSync(CARGO_LOCK, "utf8"),
  )?.[1],
};

const fileNames = Object.keys(versions);
if (fileNames.some((name) => !versions[name])) {
  console.error(`Unable to read the desktop version in: ${fileNames.filter((name) => !versions[name]).join(", ")}`);
  process.exit(1);
}

const requested = process.argv[2] !== "--check" ? process.argv[2] : undefined;
const checkOnly = process.argv.includes("--check");

const render = () =>
  fileNames.map((name) => `  ${name}: ${versions[name]}`).join("\n");

if (requested === undefined) {
  if (new Set(fileNames.map((file) => versions[file])).size !== 1) {
    console.error(`Desktop versions are out of sync:\n${render()}`);
    process.exit(1);
  }
  console.log(`Desktop files agree on version ${versions[fileNames[0]]}.`);
  process.exit(0);
}

if (!SEMVER.test(requested)) {
  console.error(`Not a MAJOR.MINOR.PATCH version: ${requested}`);
  process.exit(1);
}

if (checkOnly) {
  if (fileNames.some((file) => versions[file] !== requested)) {
    console.error(`Out of sync with the requested ${requested}:\n${render()}`);
    process.exit(1);
  }
  console.log(`All four desktop files carry version ${requested}.`);
  process.exit(0);
}

const replaceFirst = (content, from, to) => {
  if (!content.includes(from)) {
    throw new Error(`Pattern not found: ${from}`);
  }
  return content.replace(from, to);
};

const previous = versions[fileNames.find((file) => versions[file])];

writeFileSync(PACKAGE_JSON, replaceFirst(readFileSync(PACKAGE_JSON, "utf8"), `"version": "${previous}"`, `"version": "${requested}"`));
writeFileSync(
  TAURI_CONF,
  replaceFirst(readFileSync(TAURI_CONF, "utf8"), `"version": "${previous}"`, `"version": "${requested}"`),
);

// Cargo.toml: only inside the [package] section, before the next header.
const toml = readFileSync(CARGO_TOML, "utf8");
const packageHeader = toml.indexOf("[package]");
const nextHeader = toml.indexOf("\n[", packageHeader + 1);
writeFileSync(
  CARGO_TOML,
  `${toml.slice(0, packageHeader)}${toml
    .slice(packageHeader, nextHeader)
    .replace(`version = "${previous}"`, `version = "${requested}"`)}${toml.slice(nextHeader)}`,
);

// Cargo.lock: the healixdz-desktop entry.
const lock = readFileSync(CARGO_LOCK, "utf8");
writeFileSync(
  CARGO_LOCK,
  replaceFirst(
    lock,
    `name = "healixdz-desktop"\nversion = "${previous}"`,
    `name = "healixdz-desktop"\nversion = "${requested}"`,
  ),
);

console.log(`Replaced ${previous} with ${requested} in package.json, tauri.conf.json, Cargo.toml and Cargo.lock.`);
