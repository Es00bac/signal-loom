// Custom-font import UI for the Paper workspace. Lets the user upload a .ttf/.otf, vets it (unbroken +
// embeddable) before accepting it, stores it on the document, and registers it as a live browser FontFace
// so the editor renders it and the PDF/X export embeds the user's REAL font instead of a Liberation
// substitute. A broken or un-embeddable file is refused with a plain-language reason.

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePaperStore } from '../../../store/paperStore';
import { vetFontBytes } from '../../../lib/paperFontVetting';
import { buildImportedFont } from '../../../lib/paperFontLibrary';
import type { PaperImportedFont } from '../../../types/paper';
import { createBinaryAssetRecord } from '../../../shared/assets/contentAddressedAsset';
import { verifyBinaryAssetRecord } from '../../../shared/assets/contentAddressedAsset';
import { paperAssetRepository } from '../assets/PaperAssetRuntime';
import { paperFontStyleDescriptor } from '../../../lib/paperExactManagedFonts';

function genFontId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `font-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Register every imported font as a browser FontFace (idempotent) so the editor + font picker render it.
 * Runs at the workspace root so fonts are live regardless of selection, and re-registers on reopen.
 */
export function useRegisterImportedFonts(importedFonts: readonly PaperImportedFont[] | undefined): void {
  const registered = useRef(new Set<string>());
  const pending = useRef(new Set<string>());
  useEffect(() => {
    if (typeof FontFace === 'undefined' || typeof document === 'undefined') return;
    let cancelled = false;
    for (const font of importedFonts ?? []) {
      const key = `${font.id}:${font.fontAsset.id}`;
      if (registered.current.has(key) || pending.current.has(key)) continue;
      pending.current.add(key);
      void (async () => {
        try {
          const record = await paperAssetRepository.get(font.fontAsset.id);
          if (!record || cancelled
            || record.ref.id !== font.fontAsset.id
            || record.ref.sha256 !== font.fontAsset.sha256
            || record.ref.byteLength !== font.fontAsset.byteLength
            || record.ref.mimeType !== font.fontAsset.mimeType
            || !(await verifyBinaryAssetRecord(record))) return;
          // Copy into a concrete ArrayBuffer so the FontFace source type is exact (not ArrayBufferLike).
          const buffer = new ArrayBuffer(record.bytes.byteLength);
          new Uint8Array(buffer).set(record.bytes);
          const face = new FontFace(font.familyName, buffer, {
            weight: String(font.weight),
            style: paperFontStyleDescriptor(font.style, font.obliqueAngleDeg),
            stretch: `${font.stretchPercent}%`,
          });
          const loaded = await face.load();
          if (cancelled) return;
          document.fonts.add(loaded);
          registered.current.add(key);
        } catch {
          // A face the browser can't load still embeds fine on export; this is only the on-screen preview.
        } finally {
          pending.current.delete(key);
        }
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [importedFonts]);
}

function fontMimeType(file: File, format: string): string {
  if (file.type) return file.type;
  if (format === 'opentype-cff') return 'font/otf';
  if (format === 'collection') return 'font/collection';
  return 'font/ttf';
}

export function PaperFontImportControl() {
  const importedFonts = usePaperStore((s) => s.document.importedFonts);
  const addImportedFont = usePaperStore((s) => s.addImportedFont);
  const removeImportedFont = usePaperStore((s) => s.removeImportedFont);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File | undefined) => {
      setError(null);
      setNotice(null);
      if (!file) return;
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const vet = vetFontBytes(bytes);
        if (!vet.ok) {
          setError(vet.errors[0] ?? 'This font could not be imported.');
          return;
        }
        const record = await createBinaryAssetRecord(bytes, {
          mimeType: fontMimeType(file, vet.format),
          fileName: file.name,
        });
        const assetRef = await paperAssetRepository.put(record);
        const font = buildImportedFont(vet, assetRef, genFontId());
        if (!font) {
          setError("This font can't be embedded in a print export.");
          return;
        }
        addImportedFont(font);
        const label = `${font.familyName} ${font.weight}${font.style === 'normal' ? '' : ` ${font.style}`}`;
        setNotice(`Imported ${label}.${vet.warnings[0] ? ` ${vet.warnings[0]}` : ''}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to read the font file.');
      }
    },
    [addImportedFont],
  );

  const fonts = importedFonts ?? [];

  return (
    <div className="space-y-2 rounded border border-cyan-300/10 bg-[#0b121d] p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-cyan-200/70">Custom fonts</span>
        <button
          type="button"
          className="rounded border border-cyan-300/20 bg-cyan-400/10 px-2 py-1 text-xs text-cyan-100 hover:bg-cyan-400/20"
          onClick={() => inputRef.current?.click()}
        >
          Import font…
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".ttf,.otf,.ttc,.otc,font/ttf,font/otf"
        className="hidden"
        onChange={(event) => {
          void handleFile(event.target.files?.[0] ?? undefined);
          event.target.value = '';
        }}
      />
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      {notice ? <p className="text-xs text-emerald-300">{notice}</p> : null}
      {fonts.length > 0 ? (
        <ul className="space-y-1">
          {fonts.map((font) => (
            <li key={font.id} className="flex items-center justify-between gap-2 text-sm text-slate-200">
              <span className="truncate" style={{ fontFamily: font.familyName }}>
                {font.familyName}
                {` ${font.weight}${font.style === 'normal' ? '' : ` ${font.style}`}`}
                {!font.canSubset ? <span className="ml-1 text-[10px] text-amber-300/80" title="Whole font embedded (subsetting not permitted)">·full</span> : null}
              </span>
              <button
                type="button"
                className="text-slate-400 hover:text-rose-300"
                aria-label={`Remove ${font.familyName}`}
                onClick={() => removeImportedFont(font.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">
          Import a .ttf or .otf to embed your real font in PDF/X exports (instead of a metric-compatible substitute).
        </p>
      )}
    </div>
  );
}
