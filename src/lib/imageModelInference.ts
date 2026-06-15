import type {
  FirstClassImageProviderId,
  ImageModelCapabilities,
  ImageModelOperation,
  ImageNodeVisibleControl,
} from './imageProviderCapabilities';

export interface InferredImageModel {
  label: string;
  capabilities: ImageModelCapabilities;
  supportedOperations: ImageModelOperation[];
  visibleControls: ImageNodeVisibleControl[];
}

const BASE_CAPS: ImageModelCapabilities = {
  textToImage: false, imageToImage: false, promptEdit: false, maskInpaint: false,
  outpaint: false, erase: false, searchReplace: false, searchRecolor: false,
  removeBackground: false, replaceBackgroundRelight: false, upscale: false,
  referenceImages: false, maxReferenceImages: 0, exactColorControl: false,
  typography: false, textInImageEditing: false, localEndpoint: false,
};

interface VendorHint {
  match: RegExp;
  maxReferenceImages?: number;
  typography?: boolean;
  textInImageEditing?: boolean;
  maskInpaint?: boolean;
  exactColorControl?: boolean;
}

const VENDOR_HINTS: VendorHint[] = [
  { match: /nano-banana/, maxReferenceImages: 14, typography: true, textInImageEditing: true },
  { match: /qwen/, maxReferenceImages: 1, typography: true, textInImageEditing: true, maskInpaint: true },
  { match: /kontext/, maxReferenceImages: 4, typography: true, textInImageEditing: true, exactColorControl: true },
  { match: /seedream/, maxReferenceImages: 2 },
  { match: /flux/, typography: true, exactColorControl: true },
  { match: /gpt-image/, typography: true, textInImageEditing: true, maskInpaint: true },
];

interface SlugOperation {
  operations: ImageModelOperation[];
  isEdit: boolean;
  hasReferences: boolean;
  mask: boolean;
  outpaint: boolean;
}

function operationFromSlug(id: string): SlugOperation {
  const rawSeg = id.split('/').pop() ?? id;
  const seg = rawSeg.replace(/-(developer|preview|fast|turbo|hd)$/, '');
  if (/reference-to-image/.test(seg)) return { operations: ['image-edit'], isEdit: true, hasReferences: true, mask: false, outpaint: false };
  if (/(^|[-/])(inpaint|fill)$/.test(seg)) return { operations: ['mask-inpaint'], isEdit: true, hasReferences: false, mask: true, outpaint: false };
  if (/outpaint/.test(seg)) return { operations: ['outpaint'], isEdit: true, hasReferences: false, mask: false, outpaint: true };
  if (/(^|[-/])(edit|image-edit)$/.test(seg)) return { operations: ['image-edit'], isEdit: true, hasReferences: false, mask: false, outpaint: false };
  if (/upscale/.test(seg)) return { operations: ['upscale'], isEdit: true, hasReferences: false, mask: false, outpaint: false };
  return { operations: ['text-to-image'], isEdit: false, hasReferences: false, mask: false, outpaint: false };
}

function deriveControls(caps: ImageModelCapabilities, isEdit: boolean): ImageNodeVisibleControl[] {
  const controls: ImageNodeVisibleControl[] = ['prompt'];
  if (!isEdit) controls.push('aspectRatio', 'steps', 'seed');
  if (caps.imageToImage || caps.promptEdit || caps.maskInpaint) controls.push('sourceImage');
  if (caps.maskInpaint) controls.push('mask');
  if (caps.referenceImages) controls.push('referenceImages');
  if (caps.outpaint) controls.push('outpaintMargins');
  if (caps.exactColorControl) controls.push('exactColorPrompt');
  if (caps.textInImageEditing) controls.push('textEditPrompt');
  controls.push('outputFormat');
  return controls;
}

function prettyLabel(modelId: string): string {
  const parts = modelId.split('/').filter(Boolean);
  const titled = parts.map((p) => p.replace(/[-_.]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
  return titled.join(' · ') || modelId;
}

export function inferImageModelCapabilities(
  _provider: FirstClassImageProviderId,
  modelId: string,
): InferredImageModel {
  const id = modelId.trim().toLowerCase();
  const op = operationFromSlug(id);
  const hint = VENDOR_HINTS.find((h) => h.match.test(id));
  const refMax = hint?.maxReferenceImages ?? 0;

  const capabilities: ImageModelCapabilities = { ...BASE_CAPS };
  if (op.isEdit) {
    capabilities.imageToImage = true;
    capabilities.promptEdit = true;
  } else {
    capabilities.textToImage = true;
  }
  if (op.mask) capabilities.maskInpaint = true;
  if (op.outpaint) capabilities.outpaint = true;

  if (op.hasReferences || (op.isEdit && refMax > 0)) {
    capabilities.referenceImages = true;
    capabilities.maxReferenceImages = Math.max(1, refMax || 1);
  }

  if (hint) {
    if (hint.typography) capabilities.typography = true;
    if (hint.textInImageEditing && op.isEdit) capabilities.textInImageEditing = true;
    if (hint.exactColorControl) capabilities.exactColorControl = true;
    if (hint.maskInpaint && op.isEdit && !op.outpaint) capabilities.maskInpaint = true;
  }

  const operations = new Set<ImageModelOperation>(op.operations);
  if (capabilities.maskInpaint && !operations.has('mask-inpaint')) operations.add('mask-inpaint');

  return {
    label: prettyLabel(modelId),
    capabilities,
    supportedOperations: [...operations],
    visibleControls: deriveControls(capabilities, op.isEdit),
  };
}
