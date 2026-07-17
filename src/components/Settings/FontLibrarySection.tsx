import { Check, Download, LoaderCircle, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { paperAssetRepository } from '../../features/paper/assets/PaperAssetRuntime';
import type { PaperAssetRepository } from '../../features/paper/assets/PaperAssetRepository';
import { useBundledFontLibraryCapability } from '../../lib/bundledFontLibrary';
import {
  createOpenFontCatalogClient,
  downloadOpenFontFace,
  type OpenFontCatalogClient,
  type OpenFontCatalogFamily,
  type OpenFontLibraryFace,
  type OpenFontStyle,
} from '../../lib/paperOpenFontCatalog';
import { useI18n } from '../../lib/useI18n';
import { BundledFontBrowser } from '../Common/BundledFontBrowser';

export interface FontLibrarySectionProps {
  library: readonly OpenFontLibraryFace[];
  onInstall: (face: OpenFontLibraryFace) => void;
  catalog?: OpenFontCatalogClient;
  repository?: PaperAssetRepository;
}

export function FontLibrarySection({
  library,
  onInstall,
  catalog,
  repository = paperAssetRepository,
}: FontLibrarySectionProps) {
  const { t } = useI18n();
  const bundledFontLibraryAvailable = useBundledFontLibraryCapability();
  const [client] = useState(() => catalog ?? createOpenFontCatalogClient());
  const [families, setFamilies] = useState<OpenFontCatalogFamily[]>([]);
  const [selectedFamily, setSelectedFamily] = useState<OpenFontCatalogFamily | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<'browse' | 'select' | 'download' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bundledPreview, setBundledPreview] = useState('');

  const visibleFamilies = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('en-US');
    return families
      .filter((family) => !normalized || family.family.toLocaleLowerCase('en-US').includes(normalized))
      .slice(0, 80);
  }, [families, query]);
  const faceChoices = useMemo(() => selectedFamily
    ? selectedFamily.weights.flatMap((weight) => selectedFamily.styles.map((style) => ({ weight, style })))
    : [], [selectedFamily]);

  const browse = async () => {
    setBusy('browse');
    setError(null);
    try {
      setFamilies(await client.listFamilies());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('settings.fonts.error.browse'));
    } finally {
      setBusy(null);
    }
  };

  const selectFamily = async (id: string) => {
    setBusy('select');
    setError(null);
    try {
      setSelectedFamily(await client.getFamily(id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('settings.fonts.error.select'));
    } finally {
      setBusy(null);
    }
  };

  const install = async (weight: number, style: OpenFontStyle) => {
    if (!selectedFamily) return;
    setBusy('download');
    setError(null);
    try {
      const downloaded = await downloadOpenFontFace({
        id: selectedFamily.id,
        weight,
        style,
        subset: selectedFamily.defaultSubset,
        client,
        repository,
      });
      onInstall(downloaded);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('settings.fonts.error.download'));
    } finally {
      setBusy(null);
    }
  };

  const installed = (weight: number, style: OpenFontStyle) => library.some((entry) =>
    entry.face.source.url?.endsWith(`/${selectedFamily?.defaultSubset}-${weight}-${style}.ttf`),
  );

  return (
    <section className="space-y-4" aria-label={t('settings.fonts.heading')}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">{t('settings.fonts.heading')}</h3>
        <button
          className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-100 transition-colors hover:bg-cyan-400/20 disabled:cursor-wait disabled:opacity-60"
          disabled={busy !== null}
          name="browse-open-fonts"
          onClick={() => void browse()}
          type="button"
        >
          {busy === 'browse' ? <LoaderCircle className="animate-spin" size={15} /> : <Search size={15} />}
          {t('settings.fonts.browse')}
        </button>
      </div>

      {bundledFontLibraryAvailable ? (
        <div className="space-y-2 rounded-xl border border-emerald-300/15 bg-emerald-400/[0.03] p-3">
          <div>
            <div className="text-xs font-semibold text-gray-100">Sloom publishing font library</div>
            <p className="mt-1 text-[11px] leading-4 text-gray-500">116 audited families and 430 exact faces are bundled for offline design, Japanese/CJK typesetting, and commercial print.</p>
          </div>
          <BundledFontBrowser
            onSelect={(family) => setBundledPreview(family.family)}
            value={bundledPreview}
            weight={400}
          />
        </div>
      ) : null}

      <div className="border-t border-gray-800 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">Additional online fonts</div>

      {error ? <p className="rounded border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">{error}</p> : null}

      {families.length > 0 ? (
        <>
          <label className="sr-only" htmlFor="open-font-search">{t('settings.fonts.search')}</label>
          <input
            className="w-full rounded-lg border border-gray-700 bg-[#111217] px-3 py-2 text-sm text-gray-100 outline-none focus:border-cyan-300"
            id="open-font-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('settings.fonts.search')}
            value={query}
          />
          <ul className="max-h-64 divide-y divide-gray-800 overflow-y-auto rounded-lg border border-gray-800 bg-[#111217]/60">
            {visibleFamilies.map((family) => (
              <li key={family.id}>
                <button
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors ${
                    selectedFamily?.id === family.id ? 'bg-cyan-400/10 text-cyan-100' : 'text-gray-200 hover:bg-white/5'
                  }`}
                  disabled={busy !== null}
                  name={`select-open-font-${family.id}`}
                  onClick={() => void selectFamily(family.id)}
                  type="button"
                >
                  <span className="truncate font-medium">{family.family}</span>
                  <span className="shrink-0 text-xs text-gray-500">{family.weights.join(', ')}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {selectedFamily ? (
        <div className="space-y-2 rounded-lg border border-gray-800 bg-[#111217]/60 p-3">
          <div className="text-sm font-medium text-gray-100">{selectedFamily.family}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {faceChoices.map(({ weight, style }) => {
              const isInstalled = installed(weight, style);
              return (
                <div key={`${weight}-${style}`} className="flex items-center justify-between gap-3 border-b border-gray-800 py-2 last:border-b-0">
                  <span className="text-sm text-gray-300">{weight} {style}</span>
                  {isInstalled ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-300"><Check size={13} />{t('settings.fonts.offline')}</span>
                  ) : (
                    <button
                      className="inline-flex items-center gap-1 rounded border border-gray-700 px-2 py-1 text-xs text-gray-200 hover:border-cyan-300 hover:text-cyan-100 disabled:cursor-wait disabled:opacity-60"
                      disabled={busy !== null}
                      name={`download-open-font-${selectedFamily.id}-${weight}-${style}`}
                      onClick={() => void install(weight, style)}
                      type="button"
                    >
                      {busy === 'download' ? <LoaderCircle className="animate-spin" size={13} /> : <Download size={13} />}
                      {t('settings.fonts.download')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {library.length > 0 ? (
        <ul className="divide-y divide-gray-800 rounded-lg border border-gray-800 bg-[#111217]/40">
          {library.map((entry) => (
            <li key={entry.face.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="truncate text-gray-200">{entry.face.familyName} {entry.face.weight} {entry.face.style}</span>
              <span className="shrink-0 text-xs text-emerald-300">{t('settings.fonts.offline')}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
