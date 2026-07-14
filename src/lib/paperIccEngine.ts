// Real ICC color engine — Little-CMS (lcms2) compiled to WASM (MIT), wrapping profile transforms so
// the color-management seam in `paperColorManagement.ts` gets a genuine, press-accurate `icc` backend
// instead of the naive device formula. Runs in the browser, Electron, and Node (tests).
//
// This is the piece that makes CMYK real: sRGB→CMYK through a chosen output profile, with rendering
// intent + black-point compensation, exactly like InDesign/Photoshop's conversion.

import { instantiate, TYPE_CMYK_8, TYPE_RGB_8, cmsInfoDescription, type LcmsModule } from 'lcms-wasm';
import type { IccCmykTransform } from './paperColorManagement';
import type { PaperCmyk, PaperRgb } from './paperSwatches';
import { resolveBundledAssetUrl } from './bundledAssetUrl';

export type IccRenderingIntent = 'perceptual' | 'relative' | 'saturation' | 'absolute';
const INTENT_CODE: Record<IccRenderingIntent, number> = { perceptual: 0, relative: 1, saturation: 2, absolute: 3 };
const FLAGS_BLACKPOINTCOMPENSATION = 0x2000;
const FLAGS_SOFTPROOFING = 0x4000;

let wasmLocator: ((file: string) => string) | null = null;
/** App boot can override where the engine loads `lcms.wasm` from (rarely needed — see the default below). */
export function setIccWasmLocator(locate: (file: string) => string): void {
  wasmLocator = locate;
}

let enginePromise: Promise<LcmsModule> | null = null;
/** Lazily instantiate the shared lcms2 module (cached). */
export function getIccEngine(): Promise<LcmsModule> {
  if (!enginePromise) {
    const browserRuntime = typeof window !== 'undefined' && typeof (globalThis as { process?: unknown }).process === 'undefined';
    // Resolve `lcms.wasm` against the document base so it loads under both a served origin and the bare
    // `file://` the packaged Electron renderer uses (a root-absolute `/lcms.wasm` 404s under file://).
    const locateFile = wasmLocator ?? (browserRuntime ? (file: string) => resolveBundledAssetUrl(file) : undefined);
    enginePromise = instantiate(locateFile ? { locateFile } : undefined);
  }
  return enginePromise;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}
function to100(value: number): number {
  return Math.round((value / 255) * 100);
}
function safeProfileName(lcms: LcmsModule, profile: number): string {
  try {
    return (lcms.cmsGetProfileInfoASCII(profile, cmsInfoDescription, 'en', 'US') || '').trim();
  } catch {
    return '';
  }
}

export interface IccProfileInfo {
  name: string;
  colorSpace: string;
}

/** Read a profile's name + data color space (for the picker + validating a user-supplied .icc). */
export async function describeIccProfile(profileBytes: Uint8Array): Promise<IccProfileInfo> {
  const lcms = await getIccEngine();
  const profile = lcms.cmsOpenProfileFromMem(profileBytes, profileBytes.length);
  if (!profile) throw new Error('That file is not a readable ICC profile.');
  try {
    return { name: safeProfileName(lcms, profile) || 'ICC profile', colorSpace: lcms.cmsGetColorSpaceASCII(profile) };
  } finally {
    lcms.cmsCloseProfile(profile);
  }
}

/**
 * Opens and closes a real sRGB-to-CMYK lcms transform to prove that an ICC profile is usable for
 * production conversion. This intentionally does not hand a transform back to callers, so validation
 * cannot retain WASM profiles or transforms past the check.
 */
export async function validateCmykOutputProfileTransform(profileBytes: Uint8Array): Promise<void> {
  const lcms = await getIccEngine();
  const sRGB = lcms.cmsCreate_sRGBProfile();
  if (!sRGB) throw new Error('Could not create the sRGB validation profile.');
  const cmyk = lcms.cmsOpenProfileFromMem(profileBytes, profileBytes.length);
  if (!cmyk) {
    lcms.cmsCloseProfile(sRGB);
    throw new Error('Could not open the CMYK ICC profile.');
  }

  let transform = 0;
  try {
    const space = lcms.cmsGetColorSpaceASCII(cmyk);
    if (space !== 'CMYK') throw new Error(`Expected a CMYK output profile but got "${space}".`);
    transform = lcms.cmsCreateTransform(sRGB, TYPE_RGB_8, cmyk, TYPE_CMYK_8, INTENT_CODE.relative, FLAGS_BLACKPOINTCOMPENSATION);
    if (!transform) throw new Error('Could not create the ICC color transform.');
  } finally {
    if (transform) lcms.cmsDeleteTransform(transform);
    lcms.cmsCloseProfile(cmyk);
    lcms.cmsCloseProfile(sRGB);
  }
}

export interface IccTransformOptions {
  intent?: IccRenderingIntent;
  /** Black-point compensation (default true, matching Adobe's default for relative colorimetric). */
  blackPointCompensation?: boolean;
}

/**
 * Build a press-accurate sRGB→CMYK transform against a CMYK output profile. The returned object
 * satisfies `IccCmykTransform` (kind `icc`), so every color resolved through it is press-accurate
 * (`approximate: false`) in `paperColorManagement`.
 */
export async function createRgbToCmykTransform(
  cmykProfileBytes: Uint8Array,
  options: IccTransformOptions = {},
): Promise<IccCmykTransform> {
  const lcms = await getIccEngine();
  const sRGB = lcms.cmsCreate_sRGBProfile();
  const cmyk = lcms.cmsOpenProfileFromMem(cmykProfileBytes, cmykProfileBytes.length);
  if (!cmyk) {
    lcms.cmsCloseProfile(sRGB);
    throw new Error('Could not open the CMYK ICC profile.');
  }
  const space = lcms.cmsGetColorSpaceASCII(cmyk);
  if (space !== 'CMYK') {
    lcms.cmsCloseProfile(cmyk);
    lcms.cmsCloseProfile(sRGB);
    throw new Error(`Expected a CMYK output profile but got "${space}".`);
  }
  const intent = INTENT_CODE[options.intent ?? 'relative'];
  const flags = options.blackPointCompensation === false ? 0 : FLAGS_BLACKPOINTCOMPENSATION;
  const transform = lcms.cmsCreateTransform(sRGB, TYPE_RGB_8, cmyk, TYPE_CMYK_8, intent, flags);
  if (!transform) {
    lcms.cmsCloseProfile(cmyk);
    lcms.cmsCloseProfile(sRGB);
    throw new Error('Could not create the ICC color transform.');
  }
  const profileName = safeProfileName(lcms, cmyk) || 'CMYK profile';
  // sRGB + cmyk profiles are intentionally kept open for the transform's lifetime.
  return {
    kind: 'icc',
    profileName,
    rgbToCmyk: (rgb: PaperRgb): PaperCmyk => {
      const out = lcms.cmsDoTransform(transform, new Uint8Array([clampByte(rgb.r), clampByte(rgb.g), clampByte(rgb.b)]), 1);
      return { c: to100(out[0]), m: to100(out[1]), y: to100(out[2]), k: to100(out[3]) };
    },
    // Whole-image path for the raster PDF/X exporter: one lcms2 call converts the entire page. lcms
    // returns raw 0–255 CMYK samples, which are exactly the DeviceCMYK image data a PDF wants.
    transformRgbBuffer: (rgb: Uint8Array, pixelCount: number): Uint8Array =>
      lcms.cmsDoTransform(transform, rgb, pixelCount),
  };
}

export interface SoftProofOptions {
  /** Source→CMYK rendering intent (how the design is mapped into the press gamut). Default relative. */
  intent?: IccRenderingIntent;
  /**
   * Simulate the paper's white point on screen (Adobe's "Simulate Paper Color"). Uses an absolute
   * colorimetric proof→display step so white shifts toward the stock's tint. Default false.
   */
  simulatePaperWhite?: boolean;
}

export interface SoftProofTransform {
  profileName: string;
  /** Simulate how one sRGB color will look printed on this CMYK condition; returns display sRGB. */
  proofRgb(rgb: PaperRgb): PaperRgb;
  /** Whole-image soft proof: RGB in → simulated display RGB out (0–255, same length). */
  proofRgbBuffer(rgb: Uint8Array, pixelCount: number): Uint8Array;
  /** Release the lcms2 transform + profiles (call when the preview is torn down). */
  dispose(): void;
}

/**
 * Build a press-accurate soft-proof: sRGB → display sRGB while simulating how the CMYK output profile
 * will render it (lcms2 proofing transform with the SOFTPROOFING flag). This is what lets a pro *see*
 * the gamut-mapped CMYK on screen before exporting — dull blues, muddy greens, and (optionally) the
 * paper's off-white all show up, matching InDesign/Photoshop's soft-proof.
 */
export async function createSoftProofTransform(
  cmykProfileBytes: Uint8Array,
  options: SoftProofOptions = {},
): Promise<SoftProofTransform> {
  const lcms = await getIccEngine();
  const sRGB = lcms.cmsCreate_sRGBProfile();
  const cmyk = lcms.cmsOpenProfileFromMem(cmykProfileBytes, cmykProfileBytes.length);
  if (!cmyk) throw new Error('Could not open the CMYK ICC profile.');
  const space = lcms.cmsGetColorSpaceASCII(cmyk);
  if (space !== 'CMYK') {
    lcms.cmsCloseProfile(cmyk);
    throw new Error(`Expected a CMYK output profile but got "${space}".`);
  }
  const intent = INTENT_CODE[options.intent ?? 'relative'];
  // Paper-white simulation uses absolute colorimetric on the proof→display leg (and drops BPC, which
  // absolute intent ignores anyway); otherwise relative with black-point compensation.
  const simulatePaper = options.simulatePaperWhite === true;
  const proofingIntent = simulatePaper ? INTENT_CODE.absolute : INTENT_CODE.relative;
  const flags = FLAGS_SOFTPROOFING | (simulatePaper ? 0 : FLAGS_BLACKPOINTCOMPENSATION);
  const transform = lcms.cmsCreateProofingTransform(sRGB, TYPE_RGB_8, sRGB, TYPE_RGB_8, cmyk, intent, proofingIntent, flags);
  if (!transform) {
    lcms.cmsCloseProfile(cmyk);
    throw new Error('Could not create the ICC soft-proof transform.');
  }
  const profileName = safeProfileName(lcms, cmyk) || 'CMYK profile';
  let disposed = false;
  return {
    profileName,
    proofRgb: (rgb: PaperRgb): PaperRgb => {
      const out = lcms.cmsDoTransform(transform, new Uint8Array([clampByte(rgb.r), clampByte(rgb.g), clampByte(rgb.b)]), 1);
      return { r: out[0], g: out[1], b: out[2] };
    },
    proofRgbBuffer: (rgb: Uint8Array, pixelCount: number): Uint8Array => lcms.cmsDoTransform(transform, rgb, pixelCount),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      lcms.cmsDeleteTransform(transform);
      lcms.cmsCloseProfile(cmyk);
    },
  };
}
