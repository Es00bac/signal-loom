import { useState } from 'react';
import { Expand, Loader2, Maximize2, MoveDiagonal2 } from 'lucide-react';
import { useImageEditorStore } from '../../store/imageEditorStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { EditorTool } from '../../types/imageEditor';
import {
  type CanvasResizeAnchor,
} from './ImageDocumentGeometry';
import {
  describeUniversalImageUpscaleProvider,
  upscaleImageDocumentUniversal,
} from './ImageUniversalUpscale';
import { isAndroidAcceleratorConfigured } from '../../lib/androidAccelerator';
import {
  isLocalCpuUpscalerConfigured,
  runLocalCpuUpscaler,
} from '../../lib/localCpuUpscaler';
import { clearSelection } from './selectionRegistry';
import { BrushPanel } from './ImageEditorBrushProperties';
import { MovePanel, SelectionPanel } from './ImageEditorSelectionMoveProperties';
import {
  ComicMangaPanel,
  GradientPanel,
  PaintBucketPanel,
  ShapePanel,
  TextPanel,
} from './ImageEditorTextShapeProperties';

export function ImageEditorPropertiesPanel() {
  const tool = useImageEditorStore((s) => s.tool);

  return (
    <div className="h-full min-h-0 overflow-y-auto border-t border-cyan-300/10 bg-[#1a1b23] p-3">
      <div className="mb-3 text-xs font-semibold text-cyan-100/70">
        {sectionTitle(tool)}
      </div>
      {renderForTool(tool)}
      <DocumentGeometryPanel />
      <ComicMangaPanel />
    </div>
  );
}

function sectionTitle(tool: EditorTool): string {
  switch (tool) {
    case 'hand':
      return 'Hand';
    case 'brush':
      return 'Brush';
    case 'eraser':
      return 'Eraser';
    case 'cloneStamp':
      return 'Clone Stamp';
    case 'spotHeal':
      return 'Spot Heal';
    case 'blurBrush':
      return 'Blur Brush';
    case 'sharpenBrush':
      return 'Sharpen Brush';
    case 'smudgeBrush':
      return 'Smudge Brush';
    case 'dodgeBrush':
      return 'Dodge Brush';
    case 'burnBrush':
      return 'Burn Brush';
    case 'spongeSaturateBrush':
      return 'Sponge Saturate';
    case 'spongeDesaturateBrush':
      return 'Sponge Desaturate';
    case 'paintBucket':
      return 'Paint Bucket';
    case 'gradientTool':
      return 'Gradient';
    case 'rectShape':
      return 'Rectangle Shape';
    case 'ellipseShape':
      return 'Ellipse Shape';
    case 'marquee':
    case 'lasso':
    case 'magicWand':
      return 'Selection';
    case 'move':
      return 'Move';
    case 'crop':
      return 'Crop';
    case 'text':
      return 'Text';
    case 'eyedropper':
      return 'Eyedropper';
  }
}

function renderForTool(tool: EditorTool): React.ReactNode {
  switch (tool) {
    case 'hand':
      return (
        <p className="text-xs text-cyan-100/40">
          Drag the canvas to pan around the workspace without changing the image.
        </p>
      );
    case 'brush':
    case 'eraser':
    case 'cloneStamp':
    case 'spotHeal':
    case 'blurBrush':
    case 'sharpenBrush':
    case 'smudgeBrush':
    case 'dodgeBrush':
    case 'burnBrush':
    case 'spongeSaturateBrush':
    case 'spongeDesaturateBrush':
      return <BrushPanel />;
    case 'paintBucket':
      return <PaintBucketPanel />;
    case 'gradientTool':
      return <GradientPanel />;
    case 'rectShape':
    case 'ellipseShape':
      return <ShapePanel />;
    case 'marquee':
    case 'lasso':
      return <SelectionPanel showShape />;
    case 'magicWand':
      return <SelectionPanel showTolerance />;
    case 'move':
      return <MovePanel />;
    case 'eyedropper':
      return <EyedropperPanel />;
    case 'crop':
      return (
        <p className="text-xs text-cyan-100/40">
          Drag a rectangle, press Enter to commit, Esc to cancel.
        </p>
      );
    case 'text':
      return <TextPanel />;
  }
}

function EyedropperPanel() {
  const color = useImageEditorStore((s) => s.brushSettings.color);
  return (
    <div className="space-y-2 text-xs text-cyan-100/50">
      <div className="flex items-center gap-2">
        <span className="h-7 w-7 rounded border border-cyan-300/20" style={{ backgroundColor: color }} />
        <span className="font-mono text-cyan-100/80">{color}</span>
      </div>
      <p>Click the canvas to sample the visible color. Alt-click samples only the active layer.</p>
    </div>
  );
}

function DocumentGeometryPanel() {
  const subscribedActiveDoc = useImageEditorStore((s) =>
    s.documents.find((document) => document.id === s.activeDocId) ?? null,
  );
  const stateSnapshot = useImageEditorStore.getState();
  const activeDoc = subscribedActiveDoc
    ?? stateSnapshot.documents.find((document) => document.id === stateSnapshot.activeDocId)
    ?? null;
  const resizeDocumentPixels = useImageEditorStore((s) => s.resizeDocumentPixels);
  const resizeDocumentCanvas = useImageEditorStore((s) => s.resizeDocumentCanvas);
  const subscribedProviderSettings = useSettingsStore((s) => s.providerSettings);
  const providerSettingsSnapshot = useSettingsStore.getState().providerSettings;
  const providerSettings = isAndroidAcceleratorConfigured(providerSettingsSnapshot)
    ? providerSettingsSnapshot
    : subscribedProviderSettings;
  const [imageDraft, setImageDraft] = useState<{ docId: string; width: number; height: number } | null>(null);
  const [canvasDraft, setCanvasDraft] = useState<{ docId: string; width: number; height: number } | null>(null);
  const [anchor, setAnchor] = useState<CanvasResizeAnchor>('center');
  const [upscaleStatus, setUpscaleStatus] = useState<string | null>(null);
  const [upscaleBusy, setUpscaleBusy] = useState(false);

  if (!activeDoc) return null;
  const imageWidth = imageDraft?.docId === activeDoc.id ? imageDraft.width : activeDoc.width;
  const imageHeight = imageDraft?.docId === activeDoc.id ? imageDraft.height : activeDoc.height;
  const canvasWidth = canvasDraft?.docId === activeDoc.id ? canvasDraft.width : activeDoc.width;
  const canvasHeight = canvasDraft?.docId === activeDoc.id ? canvasDraft.height : activeDoc.height;

  const setImageWidth = (width: number) => setImageDraft({ docId: activeDoc.id, width, height: imageHeight });
  const setImageHeight = (height: number) => setImageDraft({ docId: activeDoc.id, width: imageWidth, height });
  const setCanvasWidth = (width: number) => setCanvasDraft({ docId: activeDoc.id, width, height: canvasHeight });
  const setCanvasHeight = (height: number) => setCanvasDraft({ docId: activeDoc.id, width: canvasWidth, height });

  const applyImageSize = () => {
    resizeDocumentPixels(activeDoc.id, imageWidth, imageHeight);
    setImageDraft(null);
  };

  const applyCanvasSize = () => {
    resizeDocumentCanvas(activeDoc.id, canvasWidth, canvasHeight, anchor);
    setCanvasDraft(null);
  };

  const isLocalCpuConfigured = isLocalCpuUpscalerConfigured(providerSettings);
  const isAndroidConfigured = isAndroidAcceleratorConfigured(providerSettings);
  const upscaleProvider = isAndroidConfigured
    ? 'android-accelerator'
    : isLocalCpuConfigured
      ? 'local-ai-cpu'
      : 'browser';
  const upscaleProviderLabel = describeUniversalImageUpscaleProvider(upscaleProvider);

  const upscale2x = () => {
    setUpscaleBusy(true);
    setUpscaleStatus(`${upscaleProviderLabel}: preparing 2x upscale...`);
    void upscaleImageDocumentUniversal({
      doc: activeDoc,
      providerSettings,
      scalePercent: 200,
      localAiCpuUpscale: isLocalCpuConfigured
        ? async (input) => runLocalCpuUpscaler({
          ...input,
          outputFormat: 'png',
          model: providerSettings.localAiCpuModel,
        })
        : undefined,
    }).then((result) => {
      useImageEditorStore.setState((state) => {
        if (!state.documents.some((document) => document.id === activeDoc.id)) {
          return state;
        }

        return {
          documents: state.documents.map((document) => (
            document.id === activeDoc.id ? result.document : document
          )),
        };
      });
      if (result.document.hasSelection === false) {
        clearSelection(activeDoc.id);
      }
      useImageEditorStore.getState().pushOperation({
        kind: 'documentState',
        docId: activeDoc.id,
        before: activeDoc,
        after: result.document,
      });
      setImageDraft(null);
      setCanvasDraft(null);
      setUpscaleStatus(result.statusMessage);
    }).catch((error) => {
      setUpscaleStatus(error instanceof Error ? error.message : 'Image upscale failed.');
    }).finally(() => {
      setUpscaleBusy(false);
    });
  };

  return (
    <div className="mt-3 space-y-3 rounded border border-cyan-300/10 bg-[#10131b] p-2 text-xs text-cyan-100/65">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold uppercase tracking-[0.16em] text-cyan-100/45">
          Document
        </div>
        <div className="font-mono text-[11px] text-cyan-100/40">
          {activeDoc.width} x {activeDoc.height}
        </div>
      </div>

      <div className="space-y-2">
        <div className="font-semibold text-cyan-100/75">Image Size</div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="W" min={1} onChange={setImageWidth} value={imageWidth} />
          <NumberField label="H" min={1} onChange={setImageHeight} value={imageHeight} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            className="flex items-center justify-center gap-1 rounded border border-cyan-300/15 bg-[#1b2230] px-2 py-1 font-semibold text-cyan-50 hover:border-cyan-300/40"
            onClick={applyImageSize}
            disabled={upscaleBusy}
            type="button"
          >
            <Maximize2 size={12} />
            Resize Image
          </button>
          <button
            className="flex items-center justify-center gap-1 rounded border border-cyan-300/15 bg-[#1b2230] px-2 py-1 font-semibold text-cyan-50 hover:border-cyan-300/40"
            disabled={upscaleBusy}
            onClick={upscale2x}
            type="button"
          >
            {upscaleBusy ? <Loader2 className="animate-spin" size={12} /> : <MoveDiagonal2 size={12} />}
            Upscale 2x
          </button>
        </div>
          <div className="rounded border border-cyan-300/10 bg-[#070b12] px-2 py-1.5 text-[11px] leading-4 text-cyan-100/55">
          <div className="font-semibold text-cyan-100/75">{upscaleProviderLabel}</div>
          {upscaleProvider === 'android-accelerator' ? (
            <div>Upscaler: {providerSettings.androidAcceleratorDefaultUpscaler ?? 'upscaler_realistic'} · provider cost $0.00</div>
          ) : upscaleProvider === 'local-ai-cpu' ? (
            <div>Model: {providerSettings.localAiCpuModel ?? 'realesrgan-4x'} · provider cost $0.00</div>
          ) : (
            <div>Phone upscaler is not configured; using local resize with provider cost $0.00.</div>
          )}
          {upscaleStatus ? <div className="mt-1 text-cyan-50">{upscaleStatus}</div> : null}
        </div>
      </div>

      <div className="space-y-2">
        <div className="font-semibold text-cyan-100/75">Canvas Size</div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="W" min={1} onChange={setCanvasWidth} value={canvasWidth} />
          <NumberField label="H" min={1} onChange={setCanvasHeight} value={canvasHeight} />
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <select
            className="min-w-0 rounded border border-cyan-300/10 bg-[#0d0f15] px-2 py-1 text-cyan-100/80"
            onChange={(event) => setAnchor(event.target.value as CanvasResizeAnchor)}
            value={anchor}
          >
            {CANVAS_ANCHORS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <button
            aria-label="Resize canvas"
            className="flex h-7 w-8 items-center justify-center rounded border border-cyan-300/15 bg-[#1b2230] text-cyan-50 hover:border-cyan-300/40"
            onClick={applyCanvasSize}
            title="Resize canvas"
            type="button"
          >
            <Expand size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

const CANVAS_ANCHORS: Array<{ value: CanvasResizeAnchor; label: string }> = [
  { value: 'center', label: 'Anchor Center' },
  { value: 'top-left', label: 'Anchor Top Left' },
  { value: 'top', label: 'Anchor Top' },
  { value: 'top-right', label: 'Anchor Top Right' },
  { value: 'left', label: 'Anchor Left' },
  { value: 'right', label: 'Anchor Right' },
  { value: 'bottom-left', label: 'Anchor Bottom Left' },
  { value: 'bottom', label: 'Anchor Bottom' },
  { value: 'bottom-right', label: 'Anchor Bottom Right' },
];

function NumberField(props: {
  label: string;
  min: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid grid-cols-[1.5rem_1fr] items-center gap-1">
      <span className="text-[11px] font-semibold text-cyan-100/45">{props.label}</span>
      <input
        className="min-w-0 rounded border border-cyan-300/10 bg-[#0d0f15] px-2 py-1 font-mono text-cyan-50"
        min={props.min}
        onChange={(event) => props.onChange(Number(event.target.value))}
        type="number"
        value={props.value}
      />
    </label>
  );
}
