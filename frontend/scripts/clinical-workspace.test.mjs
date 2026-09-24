import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { establishmentDemo } from "../src/data/dashboard-establishment.mock.ts";
import { clinicalWorkspaceFr } from "../src/i18n/locales/fr/clinical-workspace.ts";
import { clinicalWorkspaceAr } from "../src/i18n/locales/ar/clinical-workspace.ts";

// Run with Node 22+: node --experimental-strip-types --test scripts/clinical-workspace.test.mjs
function translationPaths(value, prefix = "") {
  return Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof entry === "string" ? [path] : translationPaths(entry, path);
  }).sort();
}

test("clinical copy has matching French and Arabic keys and interpolation parameters", () => {
  assert.deepEqual(translationPaths(clinicalWorkspaceFr), translationPaths(clinicalWorkspaceAr));
  for (const path of translationPaths(clinicalWorkspaceFr)) {
    const get = (dictionary) => path.split(".").reduce((value, key) => value[key], dictionary);
    assert.ok(get(clinicalWorkspaceAr).trim(), path);
    assert.deepEqual(get(clinicalWorkspaceFr).match(/\{\w+\}/g)?.sort(), get(clinicalWorkspaceAr).match(/\{\w+\}/g)?.sort(), path);
  }
});

test("presentation data is explicitly demo, with a consistent patient flow", () => {
  assert.equal(establishmentDemo.source, "demo");
  const { metrics, flow } = establishmentDemo;
  const count = (key) => flow.find((step) => step.key === key).count;
  assert.equal(metrics.planned, metrics.arrived + metrics.upcoming);
  assert.equal(count("planned"), metrics.planned);
  assert.equal(count("arrived"), metrics.arrived);
  assert.equal(count("waiting"), metrics.waiting);
  assert.equal(count("arrived"), count("waiting") + count("consulting") + count("completed"));
});

test("AI specialties and mutually exclusive workflow states reconcile", () => {
  const { ai, attention } = establishmentDemo;
  assert.deepEqual(ai.specialties.map((item) => item.key), ["brain", "cardiology", "pathology", "radiology"]);
  assert.equal(ai.specialties.reduce((total, item) => total + item.count, 0), ai.completed + ai.pending + ai.review);
  assert.equal(attention.find((item) => item.key === "ai").count, ai.review);
});

test("clinical chart covers thirty days with nonnegative, ordered data", () => {
  const points = establishmentDemo.activity;
  assert.equal(points.at(-1).day - points[0].day, 29);
  points.forEach((point, index) => {
    assert.ok(index === 0 || point.day > points[index - 1].day);
    for (const key of ["consultations", "records", "exams"]) assert.ok(point[key] >= 0);
  });
});

test("all concrete clinical navigation destinations have an existing page", () => {
  const source = readFileSync(new URL("../src/components/dashboard/layout/navigation.ts", import.meta.url), "utf8");
  for (const [, route] of source.matchAll(/href: "(\/(?:establishment|doctor)\/[^"#]+)"/g)) {
    assert.ok(existsSync(new URL(`../src/app${route}/page.tsx`, import.meta.url)), route);
  }
});
