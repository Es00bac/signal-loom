import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import {
  getMediaPreviewTitle,
  getMediaPreviewViewportClassName,
  type MediaPreviewKind,
} from '../../lib/mediaPreview';

interface MediaPreviewModalProps {
  kind: MediaPreviewKind;
  src: string;
  label?: string;
  onClose: () => void;
}

export function MediaPreviewModal({
  kind,
  src,
  label,
  onClose,
}: MediaPreviewModalProps) {
  const title = getMediaPreviewTitle(kind, label);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-w-[calc(100vw-2rem)] rounded-2xl border border-gray-700/70 bg-[#0f131b] p-3 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-gray-100">{title}</div>
            <div className="text-[11px] text-gray-500">Preview capped around 720p for fast inspection.</div>
          </div>
          <button
            className="rounded-full border border-gray-700/70 bg-[#111827] p-2 text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex items-center justify-center rounded-xl bg-black p-2">
          {kind === 'image' ? (
            <img
              alt={title}
              className={`${getMediaPreviewViewportClassName()} h-auto w-auto object-contain`}
              src={src}
            />
          ) : (
            <video
              className={`${getMediaPreviewViewportClassName()} h-auto w-auto object-contain`}
              controls
              src={src}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
