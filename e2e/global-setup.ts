import fs from 'node:fs';
import path from 'node:path';
import bwipjs from 'bwip-js';
import { chromium } from '@playwright/test';

export const FIXTURES = path.join(__dirname, '.fixtures');

/** EAN-13 barcode PNG for an ISBN, as it would be printed on the back of a book. */
async function barcodePng(isbn: string): Promise<Buffer> {
  return bwipjs.toBuffer({ bcid: 'ean13', text: isbn, scale: 5, height: 22, includetext: true, textxalign: 'center', paddingwidth: 12, paddingheight: 12, backgroundcolor: 'FFFFFF' });
}

/**
 * Builds the files the scan tests need:
 *  - barcode PNGs (a known book, and a valid ISBN nobody knows),
 *  - a "cover" photo without a barcode,
 *  - a Motion-JPEG clip of the known barcode for Chromium's fake webcam (--use-file-for-fake-video-capture).
 */
export default async function globalSetup() {
  fs.mkdirSync(FIXTURES, { recursive: true });
  const known = await barcodePng('9780132350884'); // Clean Code (in the dev fixture lookup)
  const unknown = await barcodePng('9780306406157'); // valid checksum, not in any lookup
  fs.writeFileSync(path.join(FIXTURES, 'barcode-known.png'), known);
  fs.writeFileSync(path.join(FIXTURES, 'barcode-unknown.png'), unknown);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });

  await page.setContent(
    `<body style="margin:0;background:#fff;display:flex;align-items:center;justify-content:center;height:480px">
       <img src="data:image/png;base64,${known.toString('base64')}" style="width:440px"></body>`,
  );
  const frame = await page.screenshot({ type: 'jpeg', quality: 90 });
  // A Motion-JPEG stream is just JPEG frames back to back; the same frame repeated is a steady shot.
  fs.writeFileSync(path.join(FIXTURES, 'barcode.mjpeg'), Buffer.concat(Array.from({ length: 60 }, () => frame)));

  await page.setContent(
    `<body style="margin:0;background:linear-gradient(135deg,#7c2d12,#f59e0b);color:#fff;font-family:serif;height:640px;width:420px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
       <h1 style="font-size:44px;margin:0 24px">The Pragmatic Programmer</h1><p style="font-size:24px">Andrew Hunt · David Thomas</p></body>`,
  );
  await page.setViewportSize({ width: 420, height: 640 });
  fs.writeFileSync(path.join(FIXTURES, 'cover.jpg'), await page.screenshot({ type: 'jpeg', quality: 85 }));
  await browser.close();
}
