import { useState } from 'react';
import { BundledFontBrowser } from '../../../components/Common/BundledFontBrowser';
import { installBundledPaperFontFace, type BundledFontFace, type BundledFontFamily } from '../../../lib/bundledFontLibrary';
import { usePaperStore } from '../../../store/paperStore';
import type { PaperTypography } from '../../../types/paper';
import { paperAssetRepository } from '../assets/PaperAssetRuntime';

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
      fontStyle={typography.fontStyle}
      fontWeight={Number.parseInt(typography.fontWeight, 10) || 400}
      onSelect={(family, face) => {
        onChange({
          ...typography,
          fontFamily: family.family,
          fontStyle: face.style === 'normal' ? 'normal' : 'italic',
          fontWeight: String(face.weight),
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
  fontStyle: 'normal' | 'italic';
  fontWeight: number;
  initiallyOpen?: boolean;
  onSelect: (family: BundledFontFamily, face: BundledFontFace) => void | Promise<void>;
}) {
  const addImportedFont = usePaperStore((state) => state.addImportedFont);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="space-y-1.5">
      <BundledFontBrowser
        initiallyOpen={initiallyOpen}
        onSelect={async (family, face) => {
          setNotice(null);
          const installed = await installBundledPaperFontFace({ family, face, repository: paperAssetRepository });
          addImportedFont(installed);
          await onSelect(family, face);
          setNotice(`${face.fullName} pinned to this document for exact print output.`);
        }}
        style={fontStyle}
        value={fontFamily}
        weight={fontWeight}
      />
      {notice ? <p className="text-[10px] leading-4 text-emerald-200/70">{notice}</p> : null}
    </div>
  );
}
