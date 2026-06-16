import { useRef } from 'react';
import { X, Plus, FolderOpen, ClipboardPaste } from 'lucide-react';
import { useImageEditorStore } from '../../store/imageEditorStore';

const OPEN_IMAGE_ACCEPT = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/gif',
  'image/tiff',
  'image/svg+xml',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.avif',
  '.bmp',
  '.gif',
  '.tif',
  '.tiff',
  '.svg',
].join(',');

interface ImageEditorTabsProps {
  disabled?: boolean;
  onOpenImageFile?: (file: File) => void | Promise<void>;
  onNewCanvas?: () => void;
  onNewFromClipboard?: () => void | Promise<void>;
}

export function ImageEditorTabs({ disabled = false, onOpenImageFile, onNewCanvas, onNewFromClipboard }: ImageEditorTabsProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const documents = useImageEditorStore((s) => s.documents);
  const activeDocId = useImageEditorStore((s) => s.activeDocId);
  const setActiveDocument = useImageEditorStore((s) => s.setActiveDocument);
  const closeDocument = useImageEditorStore((s) => s.closeDocument);

  return (
    <div className="flex h-8 items-center border-b border-cyan-300/10 bg-[#14151d]">
      <input
        accept={OPEN_IMAGE_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void onOpenImageFile?.(file);
        }}
        ref={fileInputRef}
        type="file"
      />
      {onNewCanvas && (
        <button
          aria-label="Create new canvas"
          className="flex h-full items-center px-3 text-cyan-100/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-45 border-r border-cyan-300/10"
          disabled={disabled}
          onClick={onNewCanvas}
          title="Create new canvas"
          type="button"
        >
          <Plus size={14} />
        </button>
      )}
      <button
        aria-label="Open image file"
        className="flex h-full items-center px-3 text-cyan-100/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-45 border-r border-cyan-300/10"
        disabled={disabled || !onOpenImageFile}
        onClick={() => fileInputRef.current?.click()}
        title="Open image file"
        type="button"
      >
        <FolderOpen size={14} />
      </button>
      {onNewFromClipboard && (
        <button
          aria-label="New image from clipboard"
          className="flex h-full items-center px-3 text-cyan-100/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-45 border-r border-cyan-300/10"
          disabled={disabled}
          onClick={() => void onNewFromClipboard()}
          title="New image from clipboard"
          type="button"
        >
          <ClipboardPaste size={14} />
        </button>
      )}
      {documents.map((doc) => (
        <div
          key={doc.id}
          className={`flex h-full cursor-pointer items-center gap-2 border-r border-cyan-300/10 px-3 text-xs ${
            doc.id === activeDocId
              ? 'bg-[#1a1b23] text-cyan-100'
              : 'text-cyan-100/50 hover:bg-[#1a1b23]/50'
          }`}
          onClick={() => setActiveDocument(doc.id)}
        >
          <span className="flex items-center gap-1">
            {doc.dirty && <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />}
            {doc.title}
          </span>
          <button
            className="text-cyan-100/30 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              closeDocument(doc.id);
            }}
            type="button"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
