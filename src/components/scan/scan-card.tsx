'use client';

import { useRef, useState } from 'react';
import { Camera, Loader2, ScanBarcode, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BarcodeScanner } from '@/components/scan/barcode-scanner';
import { useT } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { preparePhoto } from '@/lib/scan';
import type { BookInfo, Me } from '@/types/library';

export interface ScanOutcome {
  /** Details to put in the form (may be empty when only a barcode was read). */
  info: Partial<BookInfo>;
  /** Why the user should double-check, or null for a clean result. */
  note: 'filled' | { notFound: string } | { busy: string } | null;
}

interface ScanCardProps {
  features: Me['features'];
  onOutcome: (outcome: ScanOutcome) => void;
}

type Busy = null | { kind: 'photo' } | { kind: 'isbn'; isbn: string };

/** "Scan to autofill": live barcode scan, or a photo of the barcode or the cover. */
export function ScanCard({ features, onOutcome }: ScanCardProps) {
  const { t } = useT();
  const file = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<string | null>(null);

  /** ISBN -> details. A miss still keeps the ISBN, since the barcode was read correctly. */
  const resolveIsbn = async (isbn: string) => {
    if (!features.isbnLookup) return onOutcome({ info: { isbn }, note: { notFound: isbn } });
    setBusy({ kind: 'isbn', isbn });
    try {
      const info = await api.lookupIsbn(isbn);
      onOutcome({ info: { ...info, isbn }, note: 'filled' });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'not_found') onOutcome({ info: { isbn }, note: { notFound: isbn } });
      // The barcode was read fine; only the lookup is down or busy. Keep the ISBN so nothing is lost.
      else if (e instanceof ApiError && (e.code === 'lookup_unavailable' || e.status === 502 || e.status === 503)) onOutcome({ info: { isbn }, note: { busy: isbn } });
      else setMessage(errorMessage(e, t));
    } finally {
      setBusy(null);
    }
  };

  /** Photo -> barcode if there is one (cheap and exact), otherwise the vision model reads the cover. */
  const handlePhoto = async (picked: File) => {
    setMessage(null);
    setBusy({ kind: 'photo' });
    try {
      const photo = await preparePhoto(picked);
      if (photo.isbn) {
        setBusy(null);
        return await resolveIsbn(photo.isbn);
      }
      if (!features.coverScan) return setMessage(t.catalogue.scanNoBarcode);
      const info = await api.readCover(await photo.jpeg());
      onOutcome({ info, note: 'filled' });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'unreadable') setMessage(t.catalogue.scanUnreadable);
      else if (e instanceof ApiError && (e.code === 'scan_unavailable' || e.status === 502 || e.status === 503)) setMessage(t.catalogue.scanUnavailable);
      else setMessage(e instanceof ApiError ? errorMessage(e, t) : t.catalogue.scanUnreadable);
    } finally {
      setBusy((b) => (b?.kind === 'photo' ? null : b));
    }
  };

  const working = busy !== null;
  const status = busy?.kind === 'isbn' ? t.catalogue.scanLookingUp(busy.isbn) : busy ? t.catalogue.scanReading : null;

  return (
    <section aria-labelledby="scan-heading" className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 md:p-5">
      <div>
        <h2 id="scan-heading" className="font-bold text-white">
          {t.catalogue.scanTitle}
        </h2>
        <p className="text-sm text-muted-foreground">{features.coverScan ? t.catalogue.scanSubtitle : t.catalogue.scanSubtitleBarcode}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" className="h-11 gap-2 font-bold" disabled={working} onClick={() => setCamera(true)}>
          <ScanBarcode aria-hidden />
          {t.catalogue.scanBarcode}
        </Button>
        <Button type="button" variant="secondary" className="h-11 gap-2" disabled={working} onClick={() => file.current?.click()}>
          <Camera aria-hidden />
          {features.coverScan ? t.catalogue.scanCover : t.catalogue.scanPhotoBarcode}
        </Button>
      </div>

      {/* On a phone `capture` opens the camera; on a desktop it is a normal file picker. */}
      <input
        ref={file}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-label={t.catalogue.scanPhotoInput}
        data-testid="scan-photo-input"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = ''; // allow picking the same photo again
          if (picked) void handlePhoto(picked);
        }}
      />

      {status && (
        <p role="status" className="flex items-center gap-2 text-sm text-accent-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {status}
        </p>
      )}
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}

      <Dialog open={camera} onOpenChange={setCamera}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.catalogue.scanCameraTitle}</DialogTitle>
            <DialogDescription>{t.catalogue.scanCameraDesc}</DialogDescription>
          </DialogHeader>
          <BarcodeScanner
            onIsbn={(isbn) => {
              setCamera(false);
              setMessage(null);
              void resolveIsbn(isbn);
            }}
          />
          <DialogFooter>
            <Button type="button" variant="secondary" className="h-11 md:h-9" onClick={() => setCamera(false)}>
              {t.common.cancel}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 gap-2 md:h-9"
              onClick={() => {
                setCamera(false);
                file.current?.click();
              }}
            >
              <Search aria-hidden />
              {t.catalogue.scanUsePhoto}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
