// OHIF's index.html carries two inline <script> blocks (the base path, and a
// helper for dynamic imports). The Content-Security-Policy of the viewer
// (script-src 'self') forbids inline scripts, and 'unsafe-inline' would let
// any injected script run. Each inline classic script is therefore moved to a
// file of its own and replaced by a <script src>, which runs the same code in
// the same order. The build fails if an inline script is left, or if there
// was none to move (OHIF's page changed: this step must be looked at again).
//
//   node externalize-inline-scripts.mjs <dist folder> <public URL, e.g. /viewer/>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const CLASSIC_TYPES = new Set(['', 'text/javascript', 'application/javascript']);

function attribute(attributes, name) {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(
    attributes,
  );
  return match ? (match[2] ?? match[3] ?? match[4] ?? '') : null;
}

/**
 * @param {string} html the page
 * @param {string} publicUrl the base path the files will be served under, with
 *   its two slashes ("/viewer/")
 * @returns {{ html: string, files: { name: string, content: string }[] }}
 */
export function externalizeInlineScripts(html, publicUrl) {
  if (!publicUrl.startsWith('/') || !publicUrl.endsWith('/')) {
    throw new Error(`The public URL must start and end with "/": ${publicUrl}`);
  }

  const files = [];
  const out = html.replace(SCRIPT, (whole, attributes, content) => {
    if (attribute(attributes, 'src') !== null || content.trim() === '') {
      return whole;
    }
    const type = (attribute(attributes, 'type') ?? '').trim().toLowerCase();
    if (!CLASSIC_TYPES.has(type)) {
      throw new Error(`An inline script of type "${type}" cannot be moved.`);
    }
    const name = `inline-${files.length + 1}.js`;
    files.push({ content: content.trim() + '\n', name });
    return `<script src="${publicUrl}${name}"></script>`;
  });

  return { files, html: out };
}

// Scripts that still run from the page itself.
export function inlineScriptsLeft(html) {
  return [...html.matchAll(SCRIPT)].filter(
    ([, attributes, content]) => attribute(attributes, 'src') === null && content.trim() !== '',
  ).length;
}

function main(argv) {
  const [distFolder, publicUrl] = argv;
  if (!distFolder || !publicUrl) {
    throw new Error('Usage: externalize-inline-scripts.mjs <dist folder> <public URL>');
  }

  const page = join(distFolder, 'index.html');
  const { files, html } = externalizeInlineScripts(readFileSync(page, 'utf8'), publicUrl);
  if (files.length === 0) {
    throw new Error('No inline script found in index.html: OHIF changed its page.');
  }
  if (inlineScriptsLeft(html) !== 0) {
    throw new Error('An inline script is left in index.html.');
  }

  for (const file of files) {
    writeFileSync(join(distFolder, file.name), file.content);
  }
  writeFileSync(page, html);
  console.log(`index.html: ${files.length} inline script(s) moved to ${files.map((f) => f.name).join(', ')}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
