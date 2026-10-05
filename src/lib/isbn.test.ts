import { describe, expect, it } from 'vitest';
import { isbnFromBarcode, isValidIsbn, normaliseIsbn, toIsbn13 } from '@/lib/isbn';

describe('isbn', () => {
  it('validates ISBN-13 and ISBN-10 check digits', () => {
    for (const ok of ['9780306406157', '9780132350884', '0306406152', '080442957X']) expect(isValidIsbn(ok), ok).toBe(true);
    for (const bad of ['', '123', '9780306406158', '0306406153', '080442957Y', '9770306406157', '97803064061X7']) expect(isValidIsbn(bad), bad).toBe(false);
  });

  it('normalises separators and case', () => {
    expect(normaliseIsbn(' 978-0-306 40615-7 ')).toBe('9780306406157');
    expect(normaliseIsbn('080442957x')).toBe('080442957X');
  });

  it('converts ISBN-10 to ISBN-13', () => {
    expect(toIsbn13('0306406152')).toBe('9780306406157');
    expect(isValidIsbn(toIsbn13('080442957X'))).toBe(true);
    expect(toIsbn13('9780306406157')).toBe('9780306406157');
  });

  it('only accepts book barcodes from a scan', () => {
    expect(isbnFromBarcode('9780132350884')).toBe('9780132350884');
    expect(isbnFromBarcode('978-0-13-235088-4')).toBe('9780132350884');
    expect(isbnFromBarcode('0306406152')).toBe('9780306406157');
    // A shop's own EAN-13 (not 978/979), a bad check digit, or noise is ignored so scanning keeps going.
    expect(isbnFromBarcode('4006381333931')).toBeNull();
    expect(isbnFromBarcode('9780132350885')).toBeNull();
    expect(isbnFromBarcode('hello')).toBeNull();
  });
});
