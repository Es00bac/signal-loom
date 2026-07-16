export type ManagedBundledFontStyle = 'normal' | 'italic' | 'oblique';

/** Serializable exact identity for a face shipped in Sloom Studio's audited font library. */
export interface ManagedBundledFontFaceReference {
  kind: 'bundled';
  faceId: string;
  family: string;
  weight: number;
  style: ManagedBundledFontStyle;
  stretchPercent: number;
}
