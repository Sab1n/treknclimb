/**
 * CSV generation for admin exports.
 *
 * Extracted from the newsletter export so the escaping rules live in one
 * place. There are now two exports on the site that hand a file full of
 * customer-supplied text to a spreadsheet, and a security-relevant escape
 * function that exists in two copies is a function that will eventually be
 * fixed in one of them.
 */

/**
 * Escapes one CSV cell.
 *
 * Two separate problems, and it is easy to solve only the first:
 *
 * 1. **CSV quoting.** A value containing a comma, a quote or a newline has to
 *    be wrapped in quotes with inner quotes doubled, or it silently shifts
 *    every later column. An inquiry `message` is free text typed by a stranger
 *    and routinely contains all three.
 *
 * 2. **Formula injection.** A cell starting with `=`, `+`, `-`, `@`, tab or
 *    carriage return is executed as a formula when the file is opened in Excel
 *    or Sheets — `=HYPERLINK(...)` in a name column is a phishing link that
 *    arrives inside a file the recipient trusts, and every value here came from
 *    a public form. Prefixing with an apostrophe neutralises it while leaving
 *    the value readable.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value == null || value === '') return '';

  const text = String(value);
  const dangerous = /^[=+\-@\t\r]/.test(text);
  const safe = dangerous ? `'${text}` : text;

  return `"${safe.replace(/"/g, '""')}"`;
}

/** ISO 8601, or an empty cell. Machine-readable — the screens do the pretty formatting. */
export function csvDate(value: Date | null | undefined): string {
  return value ? new Date(value).toISOString() : '';
}

/**
 * Assembles a complete CSV document.
 *
 * CRLF line endings and a leading BOM: Excel on Windows reads a UTF-8 file
 * without a BOM as the system codepage, which turns every non-ASCII character
 * — a name, a country, a message — into mojibake. These files are going to be
 * opened on a Windows machine in an office in Pokhara.
 */
export function csvDocument(header: string[], rows: string[][]): string {
  const lines = [
    header.join(','),
    ...rows.map((row) => row.join(',')),
  ];

  return `﻿${lines.join('\r\n')}\r\n`;
}

/**
 * The response headers for a CSV download.
 *
 * `no-store, private` is not boilerplate: these files are personal data, and a
 * shared proxy or a browser's back/forward cache holding a copy of every
 * inquiry the company has received is exactly the leak the admin login exists
 * to prevent.
 */
export function csvHeaders(filename: string): HeadersInit {
  return {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="${filename}"`,
    'cache-control': 'no-store, private',
  };
}
