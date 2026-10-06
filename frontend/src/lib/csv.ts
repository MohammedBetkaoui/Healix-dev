import { downloadBlob } from "./download-blob";

// Cells starting with = + - @ (or tab/CR) are run as formulas by Excel, and
// exported values (names, emails, wilayas…) are user-supplied: prefix them
// with an apostrophe (OWASP CSV injection guidance). Purely numeric values
// such as "+213 555 12 34 56" cannot hold a formula and are left untouched.
const csvFormulaTrigger = /^[=+\-@\t\r]/;
const csvHarmlessNumeric = /^[+-]?[\d\s().-]+$/;

function toCsvCell(value: string | number) {
  let text = String(value);

  if (csvFormulaTrigger.test(text) && !csvHarmlessNumeric.test(text)) {
    text = `'${text}`;
  }

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadCsv(rows: (string | number)[][], fileName: string) {
  const csv = rows.map((row) => row.map(toCsvCell).join(",")).join("\r\n");
  // The BOM makes Excel read the file as UTF-8 (Arabic headers and names).
  downloadBlob(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" }), fileName);
}
