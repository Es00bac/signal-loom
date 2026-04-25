import type { ReactNode } from 'react';
import { getAspectRatioValue } from '../../lib/videoCanvas';
import type { AspectRatio } from '../../types/flow';

interface ImagePreviewPaneProps {
  src?: string;
  alt: string;
  placeholder: ReactNode;
  fallbackAspectRatio?: AspectRatio;
  className?: string;
  imageMaxHeightClassName?: string;
  minHeightClassName?: string;
}

export function ImagePreviewPane({
  src,
  alt,
  placeholder,
  fallbackAspectRatio,
  className,
  imageMaxHeightClassName,
  minHeightClassName,
}: ImagePreviewPaneProps) {
  const placeholderStyle =
    !src && fallbackAspectRatio
      ? { aspectRatio: String(getAspectRatioValue(fallbackAspectRatio)) }
      : undefined;

  return (
    <div
      className={`overflow-hidden rounded-lg border border-gray-700/60 bg-black shadow-inner ${className ?? ''}`}
      style={placeholderStyle}
    >
      {src ? (
        <div className={`flex w-full items-center justify-center p-2 ${minHeightClassName ?? 'min-h-[9rem]'}`}>
          <img
            alt={alt}
            className={`block h-auto w-auto max-w-full object-contain ${imageMaxHeightClassName ?? 'max-h-[18rem]'}`}
            src={src}
          />
        </div>
      ) : (
        <div className={`flex h-full w-full items-center justify-center p-4 ${minHeightClassName ?? 'min-h-[9rem]'}`}>
          {placeholder}
        </div>
      )}
    </div>
  );
}
