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
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on the next tick: revoking synchronously can cancel the
  // download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
