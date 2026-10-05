'use client';

import { useEffect, useRef, useState } from 'react';
import type { DecodeHintType } from '@zxing/library';
import { isbnFromBarcode } from '@/lib/isbn';
import { useT } from '@/i18n';

type Problem = 'unavailable' | 'denied' | 'failed';

interface BarcodeScannerProps {
  /** Called once with the ISBN-13 of the first book barcode seen. */
  onIsbn: (isbn: string) => void;
  /** Called when the camera cannot be used, so the parent can offer a photo instead. */
  onProblem?: (problem: Problem) => void;
}

/** Live camera preview that watches for a book barcode. Starts on mount and releases the camera on unmount. */
export function BarcodeScanner({ onIsbn, onProblem }: BarcodeScannerProps) {
  const { t } = useT();
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [hint, setHint] = useState(false);
  const callbacks = useRef({ onIsbn, onProblem });

  useEffect(() => {
    callbacks.current = { onIsbn, onProblem };
  });

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    const slow = setTimeout(() => setHint(true), 12_000);

    const fail = (p: Problem) => {
      setProblem(p);
      callbacks.current.onProblem?.(p);
    };

    void (async () => {
      // getUserMedia only exists in secure contexts (HTTPS or localhost); a plain-HTTP LAN address has none.
      if (!navigator.mediaDevices?.getUserMedia) return fail('unavailable');
      try {
        const { BarcodeFormat, DecodeHintType: Hint } = await import('@zxing/library');
        const { BrowserMultiFormatOneDReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatOneDReader(
          new Map<DecodeHintType, unknown>([
            [Hint.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]],
            [Hint.TRY_HARDER, true],
          ]),
          { delayBetweenScanAttempts: 120 },
        );
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          video.current!,
          // zxing hands us `controls` here: the first frame can decode before decodeFromConstraints has returned.
          (result, _error, scanControls) => {
            if (!result || cancelled) return;
            const isbn = isbnFromBarcode(result.getText());
            if (!isbn) return; // some other barcode (a price sticker, a shop EAN): keep looking
            cancelled = true;
            scanControls.stop();
            callbacks.current.onIsbn(isbn);
          },
        );
        if (cancelled) controls.stop();
        else stop = () => controls.stop();
      } catch (e) {
        if (cancelled) return;
        fail(e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'denied' : 'failed');
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(slow);
      stop?.();
    };
  }, []);

  if (problem) {
    return (
      <p role="alert" className="rounded-xl border border-border bg-background/60 p-4 text-sm text-muted-foreground">
        {problem === 'denied' ? t.catalogue.scanDenied : t.catalogue.scanNoCamera}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border border-border bg-black">
        <video ref={video} playsInline muted autoPlay className="aspect-[4/3] w-full object-cover" aria-label={t.catalogue.scanCameraTitle} />
        {/* Aiming guide: the barcode should sit in the box. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-[12%] inset-y-[32%] rounded-lg border-2 border-primary/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {hint ? t.catalogue.scanSlow : t.catalogue.scanCameraHint}
      </p>
    </div>
  );
}
