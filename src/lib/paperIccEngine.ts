// Real ICC color engine — Little-CMS (lcms2) compiled to WASM (MIT), wrapping profile transforms so
// the color-management seam in `paperColorManagement.ts` gets a genuine, press-accurate `icc` backend
// instead of the naive device formula. Runs in the browser, Electron, and Node (tests).
//
// This is the piece that makes CMYK real: sRGB→CMYK through a chosen output profile, with rendering
// intent + black-point compensation, exactly like InDesign/Photoshop's conversion.

import { instantiate, TYPE_CMYK_8, TYPE_RGB_8, cmsInfoDescription, type LcmsModule } from 'lcms-wasm';
import type { IccCmykTransform } from './paperColorManagement';
import type { PaperCmyk, PaperRgb } from './paperSwatches';

export type IccRenderingIntent = 'perceptual' | 'relative' | 'saturation' | 'absolute';
const INTENT_CODE: Record<IccRenderingIntent, number> = { perceptual: 0, relative: 1, saturation: 2, absolute: 3 };
const FLAGS_BLACKPOINTCOMPENSATION = 0x2000;

let wasmLocator: ((file: string) => string) | null = null;
/** App boot can point the engine at the bundled `/lcms.wasm` explicitly (belt-and-suspenders for Electron). */
export function setIccWasmLocator(locate: (file: string) => string): void {
  wasmLocator = locate;
}

let enginePromise: Promise<LcmsModule> | null = null;
/** Lazily instantiate the shared lcms2 module (cached). */
export function getIccEngine(): Promise<LcmsModule> {
  if (!enginePromise) {
    const browserRuntime = typeof window !== 'undefined' && typeof (globalThis as { process?: unknown }).process === 'undefined';
    const locateFile = wasmLocator ?? (browserRuntime ? (file: string) => `/${file}` : undefined);
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
  if (!cmyk) throw new Error('Could not open the CMYK ICC profile.');
  const space = lcms.cmsGetColorSpaceASCII(cmyk);
  if (space !== 'CMYK') {
    lcms.cmsCloseProfile(cmyk);
    throw new Error(`Expected a CMYK output profile but got "${space}".`);
  }
  const intent = INTENT_CODE[options.intent ?? 'relative'];
  const flags = options.blackPointCompensation === false ? 0 : FLAGS_BLACKPOINTCOMPENSATION;
  const transform = lcms.cmsCreateTransform(sRGB, TYPE_RGB_8, cmyk, TYPE_CMYK_8, intent, flags);
  if (!transform) {
    lcms.cmsCloseProfile(cmyk);
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
  };
}
