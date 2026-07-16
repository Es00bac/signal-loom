import type { ImageDocument } from '../types/imageEditor';
import type { ManagedBundledFontFaceReference } from '../types/managedFont';
import { normalizeBundledFontFaceReference } from './bundledFontLibrary';

function collect(value: unknown): ManagedBundledFontFaceReference[] {
  const reference = normalizeBundledFontFaceReference(value);
  return reference ? [reference] : [];
}

export function collectImageBundledFontFaceReferences(
  documents: readonly Pick<ImageDocument, 'layers' | 'snapshots'>[],
): ManagedBundledFontFaceReference[] {
  return documents.flatMap((document) => [
    ...document.layers.flatMap((layer) => collect(layer.text?.managedFace)),
    ...(document.snapshots ?? []).flatMap((snapshot) => snapshot.layers.flatMap((layer) => collect(layer.text?.managedFace))),
  ]);
}

export function collectVideoBundledFontFaceReferences({
  assets = [],
  visualClips = [],
  stageObjects = [],
}: {
  assets?: readonly { textDefaults?: { managedFace?: unknown } }[];
  visualClips?: readonly { textTypography?: { managedFace?: unknown } }[];
  stageObjects?: readonly { kind?: string; managedFace?: unknown }[];
}): ManagedBundledFontFaceReference[] {
  return [
    ...assets.flatMap((asset) => collect(asset.textDefaults?.managedFace)),
    ...visualClips.flatMap((clip) => collect(clip.textTypography?.managedFace)),
    ...stageObjects.flatMap((object) => object.kind === 'text' ? collect(object.managedFace) : []),
  ];
}
