import { ChevronDown, ChevronUp, LoaderCircle, Search, ShieldCheck, Type } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  ensureBundledFontFaceRegistered,
  loadBundledFontCatalog,
  selectBundledFontFace,
  type BundledFontCatalog,
  type BundledFontFace,
  type BundledFontFamily,
  type BundledFontRole,
} from '../../lib/bundledFontLibrary';
import type { PaperManagedFontStyle } from '../../types/paper';
import { formatFontFamily } from '../../lib/formatFontFamily';

const ROLE_OPTIONS: Array<{ value: '' | BundledFontRole; label: string }> = [
  { value: '', label: 'All roles' },
  { value: 'sans', label: 'Sans' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Monospace' },
  { value: 'display', label: 'Display' },
  { value: 'handwriting', label: 'Handwriting' },
  { value: 'japanese', label: 'Japanese' },
  { value: 'cjk', label: 'Chinese / Korean' },
];

export interface BundledFontBrowserProps {
  catalog?: BundledFontCatalog;
  disabled?: boolean;
  initiallyOpen?: boolean;
  onSelect: (family: BundledFontFamily, face: BundledFontFace) => void | Promise<void>;
  style?: PaperManagedFontStyle;
  value: string;
  weight?: number;
}

export function BundledFontBrowser({
  catalog: suppliedCatalog,
  disabled = false,
  initiallyOpen = false,
  onSelect,
  style = 'normal',
  value,
  weight = 400,
}: BundledFontBrowserProps) {
  const [open, setOpen] = useState(initiallyOpen);
  const [loadedCatalog, setLoadedCatalog] = useState<BundledFontCatalog>();
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<'' | BundledFontRole>('');
  const [busyFace, setBusyFace] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const catalog = suppliedCatalog ?? loadedCatalog;

  useEffect(() => {
    if (!open || catalog) return;
    let cancelled = false;
    void loadBundledFontCatalog().then((loaded) => {
      if (!cancelled) setLoadedCatalog(loaded);
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Bundled font library is unavailable.');
    });
    return () => { cancelled = true; };
  }, [catalog, open]);

  const visibleFamilies = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (catalog?.families ?? []).filter((family) => (
      (!role || family.role === role)
      && (!needle || `${family.family} ${family.role} ${family.faces.map((face) => face.subfamily).join(' ')}`.toLocaleLowerCase().includes(needle))
    ));
  }, [catalog, query, role]);

  const choose = async (family: BundledFontFamily, face: BundledFontFace) => {
    setBusyFace(face.id);
    setError(null);
    try {
      await ensureBundledFontFaceRegistered(family, face).catch(() => undefined);
      await onSelect(family, face);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The font face could not be selected.');
    } finally {
      setBusyFace(null);
    }
  };

  return (
    <div className="rounded-lg border border-cyan-300/15 bg-[#0b121d]">
      <button
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs text-cyan-100 hover:bg-cyan-400/5 disabled:opacity-50"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Type className="shrink-0 text-cyan-300" size={15} />
          <span className="min-w-0">
            <span className="block font-semibold">Browse bundled fonts</span>
            <span className="block truncate text-[10px] text-cyan-100/45">{value || 'Choose an audited family and exact face'}</span>
          </span>
        </span>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>

      {open ? (
        <div className="space-y-2 border-t border-cyan-300/10 p-3">
          <div className="grid grid-cols-[1fr_8rem] gap-2">
            <label className="relative block">
              <span className="sr-only">Search fonts</span>
              <Search className="pointer-events-none absolute left-2 top-2 text-cyan-100/35" size={14} />
              <input
                aria-label="Search fonts"
                className="w-full rounded border border-cyan-300/15 bg-[#151d29] py-1.5 pl-7 pr-2 text-xs text-white outline-none focus:border-cyan-300/50"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Family, face…"
                role="searchbox"
                value={query}
              />
            </label>
            <select
              aria-label="Font role"
              className="rounded border border-cyan-300/15 bg-[#151d29] px-2 py-1.5 text-xs text-cyan-100 outline-none focus:border-cyan-300/50"
              onChange={(event) => setRole(event.target.value as '' | BundledFontRole)}
              value={role}
            >
              {ROLE_OPTIONS.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-cyan-100/45">
            <span>{catalog ? `${catalog.familyCount} families · ${catalog.faceCount} faces` : 'Loading audited library…'}</span>
            <span className="inline-flex items-center gap-1 text-emerald-200/70"><ShieldCheck size={12} /> Offline · license-audited</span>
          </div>
          <p className="text-[10px] leading-4 text-cyan-100/45">Exact face selection; Paper pins and embeds it in PDF/PDF-X output. KDP keeps the same glyphs in its flattened print pages.</p>

          {error ? <p className="rounded border border-rose-400/25 bg-rose-400/10 px-2 py-1 text-[11px] text-rose-100">{error}</p> : null}
          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {!catalog && !error ? <div className="flex justify-center p-5"><LoaderCircle className="animate-spin text-cyan-300" size={18} /></div> : null}
            {visibleFamilies.map((family) => {
              const face = selectBundledFontFace(family, weight, style);
              const selected = family.family === value || value.split(',')[0]?.replace(/["']/g, '').trim() === family.family;
              return (
                <div className={`rounded border ${selected ? 'border-cyan-300/45 bg-cyan-400/10' : 'border-cyan-300/10 bg-[#151d29]'}`} key={family.id}>
                  <button
                    aria-label={`${family.family}, ${face.subfamily}`}
                    className="flex w-full items-center justify-between gap-3 px-2.5 py-2 text-left transition-colors hover:bg-cyan-400/5"
                    disabled={busyFace !== null}
                    onClick={() => void choose(family, face)}
                    style={{ fontFamily: formatFontFamily(family.family) }}
                    type="button"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-white">{family.family}</span>
                      <span className="block truncate font-sans text-[10px] text-cyan-100/45">Ag あア · {family.role} · {family.faces.length} face{family.faces.length === 1 ? '' : 's'}</span>
                    </span>
                    <span className="shrink-0 text-right font-sans text-[10px] text-cyan-100/55">
                      <span className="block">{face.weight} {face.subfamily}</span>
                      <span className="block">{face.variable ? 'variable default' : family.licenseId}</span>
                    </span>
                  </button>
                  {selected && family.faces.length > 1 ? (
                    <div className="flex flex-wrap gap-1 border-t border-cyan-300/10 px-2 py-2 font-sans">
                      {family.faces.map((exactFace) => (
                        <button
                          aria-label={`Use ${family.family} ${exactFace.subfamily}`}
                          className={`rounded border px-1.5 py-1 text-[10px] ${exactFace.weight === weight && exactFace.style === style ? 'border-cyan-300/45 bg-cyan-300/10 text-cyan-50' : 'border-cyan-300/10 text-cyan-100/55 hover:border-cyan-300/35'}`}
                          disabled={busyFace !== null}
                          key={exactFace.id}
                          onClick={() => void choose(family, exactFace)}
                          type="button"
                        >
                          {exactFace.weight} {exactFace.subfamily}{exactFace.variable ? ' · variable' : ''}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {catalog && visibleFamilies.length === 0 ? <p className="p-4 text-center text-xs text-cyan-100/40">No matching families.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
