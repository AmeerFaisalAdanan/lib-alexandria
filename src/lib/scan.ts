import type { DecodeHintType } from '@zxing/library';
import { isbnFromBarcode } from '@/lib/isbn';

/** Longest edge sent to the vision model. Larger photos are slower and cost more without reading better. */
export const COVER_MAX_EDGE = 1568;
/** Longest edge when looking for a barcode: bars need resolution, so this is bigger. */
const BARCODE_MAX_EDGE = 2400;

async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  // 'from-image' applies the EXIF rotation phones record, so portrait photos are not sideways.
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

function toCanvas(bitmap: ImageBitmap, maxEdge: number): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const toJpeg = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.85));

/** Looks for a book barcode in a photo and returns its ISBN-13 (null when there is none). */
export async function findIsbnInCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  // Book barcodes are 1D (EAN-13). The 1D reader does not try QR/Aztec/etc., which the multi-format reader
  // logs a console warning for on every picture that has no such code.
  const { BarcodeFormat, BinaryBitmap, DecodeHintType: Hint, HybridBinarizer, MultiFormatOneDReader } = await import('@zxing/library');
  const { HTMLCanvasElementLuminanceSource } = await import('@zxing/browser');
  const hints = new Map<DecodeHintType, unknown>([
    [Hint.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]],
    [Hint.TRY_HARDER, true],
  ]);
  try {
    const bitmap = new BinaryBitmap(new HybridBinarizer(new HTMLCanvasElementLuminanceSource(canvas)));
    return isbnFromBarcode(new MultiFormatOneDReader(hints).decode(bitmap, hints).getText());
  } catch {
    return null; // NotFoundException / ChecksumException / FormatException: no usable barcode in the picture
  }
}

export interface PreparedPhoto {
  /** ISBN-13 read from a barcode in the photo, if any. */
  isbn: string | null;
  /** A JPEG small enough to send to the cover reader. */
  jpeg: () => Promise<Blob>;
}

/** Decodes a photo once: looks for a barcode, and can produce a downsized JPEG for the cover reader. */
export async function preparePhoto(file: Blob): Promise<PreparedPhoto> {
  const bitmap = await loadBitmap(file);
  const isbn = await findIsbnInCanvas(toCanvas(bitmap, BARCODE_MAX_EDGE));
  return { isbn, jpeg: () => toJpeg(toCanvas(bitmap, COVER_MAX_EDGE)) };
}
