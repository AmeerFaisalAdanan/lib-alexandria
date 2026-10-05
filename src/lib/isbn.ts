/** ISBN helpers (mirrors backend/internal/lookup/isbn.go). */

export const normaliseIsbn = (raw: string) => raw.replace(/[-\s]/g, '').toUpperCase();

export function isValidIsbn(s: string): boolean {
  if (/^\d{9}[\dX]$/.test(s)) {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += (s[i] === 'X' ? 10 : Number(s[i])) * (10 - i);
    return sum % 11 === 0;
  }
  if (/^97[89]\d{10}$/.test(s)) {
    let sum = 0;
    for (let i = 0; i < 13; i++) sum += Number(s[i]) * (i % 2 === 1 ? 3 : 1);
    return sum % 10 === 0;
  }
  return false;
}

export function toIsbn13(s: string): string {
  if (s.length !== 10) return s;
  const body = `978${s.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 1 ? 3 : 1);
  return body + String((10 - (sum % 10)) % 10);
}

/** The ISBN-13 for decoded barcode text, or null when it is not a book barcode (e.g. a shop's own EAN). */
export function isbnFromBarcode(text: string): string | null {
  const s = normaliseIsbn(text);
  return isValidIsbn(s) ? toIsbn13(s) : null;
}
