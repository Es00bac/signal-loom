import { ChevronDown, ChevronUp, LoaderCircle, Search, ShieldCheck, Type } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ensureBundledFontFaceRegistered,
  loadBundledFontCatalog,
  selectBundledFontFace,
  useBundledFontLibraryCapability,
  type BundledFontCatalog,
  type BundledFontFace,
  type BundledFontFamily,
  type BundledFontRole,
} from '../../lib/bundledFontLibrary';
import { getSignalLoomNativeBridge, type SignalLoomNativeBridge } from '../../lib/nativeApp';
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

interface BridgeScopedCatalogState {
  bridge: SignalLoomNativeBridge | undefined;
  catalog?: BundledFontCatalog;
  error: string | null;
}

/**
 * A selection remains authoritative only while its exact bridge and selection turn remain
 * current. Async consumers may retain this small check across their own awaits.
 */
export interface BundledFontSelectionAuthority {
  isCurrent: () => boolean;
}

interface SelectionAuthorityGeneration {
  id: number;
}

interface SelectionScopedErrorState {
  authority: BundledFontSelectionAuthority;
  error: string | null;
  generation: SelectionAuthorityGeneration;
}

interface SelectionScopedBusyState {
  authority: BundledFontSelectionAuthority;
  faceId: string;
  generation: SelectionAuthorityGeneration;
}

// An identity is never reused, including after A → B → A bridge replacement or an unmount and
// remount that happens to receive the same bridge object again.
let nextSelectionAuthorityGeneration = 0;

function createSelectionAuthorityGeneration(..._inputs: readonly unknown[]): SelectionAuthorityGeneration {
  return { id: ++nextSelectionAuthorityGeneration };
}

export interface BundledFontBrowserProps {
  catalog?: BundledFontCatalog;
  disabled?: boolean;
  initiallyOpen?: boolean;
  onSelect: (family: BundledFontFamily, face: BundledFontFace, authority: BundledFontSelectionAuthority) => void | Promise<void>;
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
  // Starts (and stays) false until the main-process round trip positively confirms a usable
  // font-library root — fail closed while pending, not just once it resolves negative.
  const bridge = getSignalLoomNativeBridge();
  const available = useBundledFontLibraryCapability();
  const [open, setOpen] = useState(initiallyOpen);
  const [catalogState, setCatalogState] = useState<BridgeScopedCatalogState>({ bridge, error: null });
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<'' | BundledFontRole>('');
  const [busyState, setBusyState] = useState<SelectionScopedBusyState | null>(null);
  const [selectionErrorState, setSelectionErrorState] = useState<SelectionScopedErrorState | null>(null);
  const selectionTurn = useRef(0);
  const activeSelectionGeneration = useRef<SelectionAuthorityGeneration | null>(null);
  const selectionInputGeneration = useMemo(
    () => createSelectionAuthorityGeneration(bridge, suppliedCatalog, value, style, weight, onSelect),
    [bridge, onSelect, style, suppliedCatalog, value, weight],
  );

  // A selection authority belongs to one committed input generation, not merely a bridge object.
  // Cleanup irrevocably revokes it before the next input generation commits and on unmount.
  useLayoutEffect(() => {
    activeSelectionGeneration.current = selectionInputGeneration;
    return () => {
      if (activeSelectionGeneration.current === selectionInputGeneration) {
        activeSelectionGeneration.current = null;
      }
    };
  }, [selectionInputGeneration]);

  // A catalog/error has authority only while the exact bridge that loaded it remains current.
  // This makes bridge replacement fail closed even in the render before effects can clean up.
  const loadedCatalog = catalogState.bridge === bridge ? catalogState.catalog : undefined;
  const catalogError = catalogState.bridge === bridge ? catalogState.error : null;
  const selectionError = selectionErrorState?.generation === selectionInputGeneration && selectionErrorState.authority.isCurrent()
    ? selectionErrorState.error
    : null;
  const busyFace = busyState?.generation === selectionInputGeneration && busyState.authority.isCurrent()
    ? busyState.faceId
    : null;
  const error = catalogError ?? selectionError;
  const catalog = suppliedCatalog ?? loadedCatalog;

  useEffect(() => {
    if (!available || !open || catalog) return;
    let cancelled = false;
    void loadBundledFontCatalog().then((loaded) => {
      if (!cancelled && getSignalLoomNativeBridge() === bridge) {
        setCatalogState({ bridge, catalog: loaded, error: null });
      }
    }).catch((reason) => {
      if (!cancelled && getSignalLoomNativeBridge() === bridge) {
        setCatalogState({
          bridge,
          error: reason instanceof Error ? reason.message : 'Bundled font library is unavailable.',
        });
      }
    });
    return () => { cancelled = true; };
  }, [available, bridge, catalog, open]);

  const visibleFamilies = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (catalog?.families ?? []).filter((family) => (
      (!role || family.role === role)
      && (!needle || `${family.family} ${family.role} ${family.faces.map((face) => face.subfamily).join(' ')}`.toLocaleLowerCase().includes(needle))
    ));
  }, [catalog, query, role]);

  const choose = async (family: BundledFontFamily, face: BundledFontFace) => {
    const generation = activeSelectionGeneration.current;
    if (!generation) return;
    const turn = ++selectionTurn.current;
    const authority: BundledFontSelectionAuthority = {
      isCurrent: () => (
        activeSelectionGeneration.current === generation
        && getSignalLoomNativeBridge() === bridge
        && selectionTurn.current === turn
      ),
    };
    if (!authority.isCurrent()) return;
    setBusyState({ authority, faceId: face.id, generation });
    setSelectionErrorState(null);
    try {
      await ensureBundledFontFaceRegistered(family, face);
      // Registration can outlive a bridge replacement. Check both directly after it settles and
      // at the ordinary-callback boundary so no stale renderer authority can publish selection.
      if (!authority.isCurrent()) return;
      await onSelect(family, face, authority);
    } catch (reason) {
      if (authority.isCurrent()) {
        setSelectionErrorState({
          authority,
          error: reason instanceof Error ? reason.message : 'The font face could not be selected.',
          generation,
        });
      }
    } finally {
      // A replacement bridge can begin a new selection while this old registration settles.
      // Only the exact selection that published the busy state may clear it.
      setBusyState((current) => current?.authority === authority ? null : current);
    }
  };

  if (!available) return null;

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
