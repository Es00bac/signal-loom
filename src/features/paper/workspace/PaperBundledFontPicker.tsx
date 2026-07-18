import { useCallback, useState } from 'react';
import { BundledFontBrowser, type BundledFontSelectionAuthority } from '../../../components/Common/BundledFontBrowser';
import { installBundledPaperFontFace, type BundledFontFace, type BundledFontFamily } from '../../../lib/bundledFontLibrary';
import { usePaperStore } from '../../../store/paperStore';
import type { PaperManagedFontStyle, PaperTypography } from '../../../types/paper';
import { paperAssetRepository } from '../assets/PaperAssetRuntime';
import { paperFontStyleFromCss } from '../../../lib/paperExactManagedFonts';

export function PaperBundledFontPicker({
  onChange,
  typography,
}: {
  onChange: (typography: PaperTypography) => void;
  typography: PaperTypography;
}) {
  return (
    <PaperBundledFontFaceBrowser
      fontFamily={typography.fontFamily}
      fontStyle={paperFontStyleFromCss(typography.fontStyle)}
      fontWeight={Number.parseInt(typography.fontWeight, 10) || 400}
      onSelect={(family, face) => {
        const variationSettings = Object.keys(face.axes).length
          ? Object.fromEntries(Object.entries(face.axes).map(([tag, axis]) => [tag, axis.default]))
          : undefined;
        onChange({
          ...typography,
          fontFamily: family.family,
          fontStyle: face.style === 'oblique'
            ? (paperFontStyleFromCss(typography.fontStyle) === 'oblique' ? typography.fontStyle : 'oblique 14deg')
            : face.style,
          fontWeight: String(face.weight),
          fontStretch: `${face.stretchPercent}%`,
          ...(variationSettings ? { fontVariationSettings: variationSettings } : {}),
        });
      }}
    />
  );
}

export function PaperBundledFontFaceBrowser({
  fontFamily,
  fontStyle,
  fontWeight,
  initiallyOpen = false,
  onSelect,
}: {
  fontFamily: string;
  fontStyle: PaperManagedFontStyle;
  fontWeight: number;
  initiallyOpen?: boolean;
  onSelect: (family: BundledFontFamily, face: BundledFontFace, authority: BundledFontSelectionAuthority) => void | Promise<void>;
}) {
  const addImportedFont = usePaperStore((state) => state.addImportedFont);
  const [notice, setNotice] = useState<string | null>(null);
  const selectBundledPaperFace = useCallback(async (
    family: BundledFontFamily,
    face: BundledFontFace,
    authority: BundledFontSelectionAuthority,
  ) => {
    if (!authority.isCurrent()) return;
    setNotice(null);
    const installed = await installBundledPaperFontFace({ family, face, repository: paperAssetRepository });
    // Pinning bytes has its own async boundary. The browser could have moved to another
    // renderer bridge while it was in flight, so no document or notice state may publish.
    if (!authority.isCurrent()) return;
    addImportedFont(installed);
    if (!authority.isCurrent()) return;
    await onSelect(family, face, authority);
    if (!authority.isCurrent()) return;
    setNotice(`${face.fullName} pinned to this document for exact print output.`);
  }, [addImportedFont, onSelect]);

  return (
    <div className="space-y-1.5">
      <BundledFontBrowser
        initiallyOpen={initiallyOpen}
        onSelect={selectBundledPaperFace}
        style={fontStyle}
        value={fontFamily}
        weight={fontWeight}
      />
      {notice ? <p className="text-[10px] leading-4 text-emerald-200/70">{notice}</p> : null}
    </div>
  );
}
