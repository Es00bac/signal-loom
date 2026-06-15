import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import { useImageEditorStore } from '../../store/imageEditorStore';
import { useProjectUsageStore } from '../../store/projectUsageStore';
import {
  buildGenerativeFillPrompt,
  runGenerativeFill,
  type GenerativeFillReferenceInput,
  type GenerativeFillProvider,
} from '../../lib/imageEditorAi';
import {
  canRunImageEditorOperation,
  estimateImageEditorOperationCostUsd,
  getImageEditorOperationsForModel,
  type ImageEditorOperationId,
  type ImageEditorProviderId,
} from '../../lib/imageEditorOperations';
import {
  listImageModelDefinitions,
  type FirstClassImageProviderId,
} from '../../lib/imageProviderCapabilities';
import { getSelection, setSelection } from './selectionRegistry';
import { cloneMask, createMask, maskBoundingBox } from './SelectionMask';
import { docRectToScreen } from './viewport';
import { buildGenerativeFillRequestArtifacts } from './GenerativeFillArtifacts';
import { createGenerativeFillLayerFromBlob } from './GenerativeFillLayer';
import { renderImageDocumentLayersToBitmap } from './ImageAdjustmentLayer';
import { createBitmap } from './LayerBitmap';
import { configureDetectorKeys, listConfiguredDetectors } from '../../lib/imageMask/objectMaskDetectors';
import { useSettingsStore } from '../../store/settingsStore';
import type { RuntimeSettingsSnapshot } from '../../types/flow';
import {
  getDraggedSourceLibraryItemId,
  hasDraggedSourceLibraryItem,
} from '../../lib/sourceLibraryWorkspaceActions';
import { useSourceBinStore } from '../../store/sourceBinStore';
import { useConfirmationStore } from '../../store/confirmationStore';
import { showAlertDialog } from '../../store/alertDialogStore';

const COST_THRESHOLD_USD = 0.5;

const PROVIDER_LABELS: { value: GenerativeFillProvider; label: string }[] = [
  { value: 'gemini', label: 'Gemini' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'atlas', label: 'Atlas Cloud' },
  { value: 'huggingface', label: 'Hugging Face' },
  { value: 'bfl', label: 'BFL FLUX.2' },
  { value: 'stability', label: 'Stability' },
  { value: 'localOpen', label: 'Local/Open' },
  { value: 'generic', label: 'Generic HTTP' },
];

export interface GenerativeFillBarReferenceSlotDescriptor {
  slotIndex: number;
  id: string;
  label: string;
  sourceSummary: string;
  chipLabel: string;
  removeTitle: string;
}

export function describeGenerativeFillBarReferenceSlots(
  references: Array<Pick<GenerativeFillReferenceInput, 'id' | 'label' | 'description' | 'imageUrl'>>,
): GenerativeFillBarReferenceSlotDescriptor[] {
  return references.map((reference, index) => {
    const slotIndex = index + 1;
    const sourceSummary = describeReferenceSlotSource(reference);
    const label = describeReferenceSlotLabel(reference, slotIndex);

    return {
      slotIndex,
      id: reference.id,
      label,
      sourceSummary,
      chipLabel: `Ref ${slotIndex}: ${label}`,
      removeTitle: `Remove reference slot ${slotIndex} (${sourceSummary})`,
    };
  });
}

export function GenerativeFillBar() {
  const activeDoc = useImageEditorStore((s) =>
    s.documents.find((d) => d.id === s.activeDocId) ?? null,
  );
  const dismissed = useImageEditorStore((s) =>
    s.activeDocId ? Boolean(s.generativeFillDismissedByDocId[s.activeDocId]) : false,
  );
  const addLayer = useImageEditorStore((s) => s.addLayer);
  const viewportContainerSize = useImageEditorStore((s) => s.viewportContainerSize);

  const [prompt, setPrompt] = useState('');
  const [provider, setProvider] = useState<GenerativeFillProvider>('gemini');
  const [model, setModel] = useState(() => getDefaultModelForProvider('gemini'));
  const [operation, setOperation] = useState<ImageEditorOperationId>('inpaint');
  const [searchPrompt, setSearchPrompt] = useState('');
  const [outpaint, setOutpaint] = useState({
    left: 0,
    right: 0,
    up: 0,
    down: 0,
    creativity: 0.5,
  });
  const [edgeFeatherPx, setEdgeFeatherPx] = useState(3);
  const [referenceDescription, setReferenceDescription] = useState('');
  const [referenceImageUrl, setReferenceImageUrl] = useState('');
  const [references, setReferences] = useState<GenerativeFillReferenceInput[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apiKeys = useSettingsStore((s) => s.apiKeys);
  const providerSettings = useSettingsStore((s) => s.providerSettings);
  const [detectPhrase, setDetectPhrase] = useState('');
  const [detecting, setDetecting] = useState(false);
  const settingsSnapshot = useMemo(
    () => ({ apiKeys, providerSettings }) as RuntimeSettingsSnapshot,
    [apiKeys, providerSettings],
  );
  const maskDetector = useMemo(() => listConfiguredDetectors(settingsSnapshot)[0], [settingsSnapshot]);

  const handleDetect = async () => {
    if (!activeDoc || !maskDetector || !detectPhrase.trim()) {
      return;
    }
    setDetecting(true);
    setError(null);
    const flattened = renderImageDocumentLayersToBitmap(activeDoc);
    const sourceCanvas = createBitmap(activeDoc.width, activeDoc.height);
    const sourceCtx = sourceCanvas.getContext('2d');
    if (!sourceCtx) {
      setDetecting(false);
      setError('Failed to flatten the document for detection.');
      return;
    }
    sourceCtx.drawImage(flattened, 0, 0);
    const sourceBlob = await sourceCanvas.convertToBlob({ type: 'image/png' });
    const sourceUrl = URL.createObjectURL(sourceBlob);
    try {
      configureDetectorKeys(settingsSnapshot);
      const detection = await maskDetector.detect({
        sourceImageDataUrl: sourceUrl,
        phrase: detectPhrase.trim(),
        width: activeDoc.width,
        height: activeDoc.height,
      });
      const detectedImage = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Unable to decode detection mask.'));
        img.src = detection.maskDataUrl;
      });
      const maskCanvas = createBitmap(activeDoc.width, activeDoc.height);
      const maskCtx = maskCanvas.getContext('2d');
      if (!maskCtx) throw new Error('Failed to read the detection mask.');
      maskCtx.drawImage(detectedImage, 0, 0, activeDoc.width, activeDoc.height);
      const maskData = maskCtx.getImageData(0, 0, activeDoc.width, activeDoc.height).data;
      const mask = createMask(activeDoc.width, activeDoc.height);
      for (let p = 0; p < mask.data.length; p += 1) {
        mask.data[p] = maskData[p * 4 + 3];
      }
      setSelection(activeDoc.id, mask);
      const store = useImageEditorStore.getState();
      store.setHasSelection(activeDoc.id, Boolean(maskBoundingBox(mask)));
      store.bumpSelectionVersion(activeDoc.id);
    } catch (detectError) {
      setError(detectError instanceof Error ? detectError.message : 'Object detection failed.');
    } finally {
      URL.revokeObjectURL(sourceUrl);
      setDetecting(false);
    }
  };
  const abortRef = useRef<AbortController | null>(null);
  const refFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleRefDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!hasDraggedSourceLibraryItem(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();

    const itemId = getDraggedSourceLibraryItemId(event.dataTransfer);
    const item = itemId
      ? useSourceBinStore.getState().getAllItems().find((candidate) => candidate.id === itemId)
      : undefined;

    if (item && item.kind === 'image' && item.assetUrl) {
      setReferences((current) => [
        ...current,
        {
          id: `ref-drag-${Date.now()}-${current.length}`,
          label: item.label,
          imageUrl: item.assetUrl,
        },
      ]);
    }
  };

  const handleRefFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      setReferences((current) => [
        ...current,
        {
          id: `ref-file-${Date.now()}-${current.length}`,
          label: file.name,
          imageUrl: dataUrl,
        },
      ]);
    } catch (err: unknown) {
      await showAlertDialog({
        title: 'Reference File Failed',
        message: `Failed to read the local reference file. ${err instanceof Error ? err.message : ''}`.trim(),
        tone: 'danger',
      });
    }
  };

  const visible = Boolean(activeDoc?.hasSelection) && !dismissed;

  const anchor = useMemo(() => {
    if (!activeDoc) return null;
    const mask = getSelection(activeDoc.id);
    if (!mask) return null;
    const bbox = maskBoundingBox(mask);
    if (!bbox) return null;
    return docRectToScreen(bbox, activeDoc.viewport);
  }, [activeDoc]);

  useEffect(() => {
    if (!visible) {
      abortRef.current?.abort();
      queueMicrotask(() => setError(null));
    }
  }, [visible]);

  const modelOptions = useMemo(() => getModelOptions(provider), [provider]);
  const effectiveModel = modelOptions.some((candidate) => candidate.modelId === model)
    ? model
    : (modelOptions[0]?.modelId ?? 'generic-http');
  const operationOptions = useMemo(
    () => getImageEditorOperationsForModel(provider as ImageEditorProviderId, effectiveModel)
      .filter((candidate) => !candidate.localOnly),
    [effectiveModel, provider],
  );
  const referenceSlots = useMemo(() => describeGenerativeFillBarReferenceSlots(references), [references]);
  const effectiveOperationId = operationOptions.some((candidate) => candidate.id === operation)
    ? operation
    : operationOptions[0]?.id;

  if (!visible || !activeDoc || !anchor) return null;

  const containerHeight = viewportContainerSize.height;
  const containerWidth = viewportContainerSize.width;

  const compactPanel = containerWidth < 640;
  const horizontalMargin = compactPanel ? 8 : 16;
  const preferredPanelWidth = Math.min(780, Math.max(500, containerWidth - 32));
  const maxPanelWidth = Math.max(240, containerWidth - horizontalMargin * 2);
  const panelWidth = Math.min(preferredPanelWidth, maxPanelWidth);
  const estimatedPanelHeight = compactPanel ? Math.min(520, Math.max(280, containerHeight - horizontalMargin * 2)) : 260;
  const placeAbove = anchor.y > 60;
  const belowAnchorTop = anchor.y + anchor.height + 8;
  const aboveAnchorTop = anchor.y - estimatedPanelHeight - 8;
  const maxTop = Math.max(horizontalMargin, containerHeight - estimatedPanelHeight - horizontalMargin);
  const top = placeAbove
    ? Math.max(horizontalMargin, aboveAnchorTop)
    : Math.min(maxTop, Math.max(horizontalMargin, belowAnchorTop));
  const left = Math.min(
    Math.max(horizontalMargin, anchor.x),
    Math.max(horizontalMargin, containerWidth - panelWidth - horizontalMargin),
  );
  const maxHeight = Math.max(96, containerHeight - top - horizontalMargin);
  const primaryControlsClassName = compactPanel ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-4 gap-2';
  const referenceControlsClassName = compactPanel
    ? 'grid grid-cols-2 gap-1.5'
    : 'grid grid-cols-[1fr_1fr_auto_auto] gap-1.5';
  const referenceInputClassName = compactPanel
    ? 'col-span-2 min-w-0 rounded border border-cyan-300/10 bg-[#070a10] px-2 py-1 text-xs text-cyan-50 placeholder:text-cyan-100/30 text-left'
    : 'min-w-0 rounded border border-cyan-300/10 bg-[#070a10] px-2 py-1 text-xs text-cyan-50 placeholder:text-cyan-100/30 text-left';

  const selectedOperation = operationOptions.find((candidate) => candidate.id === effectiveOperationId) ?? operationOptions[0];
  const runCheck = selectedOperation
    ? canRunImageEditorOperation({
        operationId: selectedOperation.id,
        providerId: provider as ImageEditorProviderId,
        modelId: effectiveModel,
        hasActiveLayer: Boolean(activeDoc.activeLayerId),
        hasSelection: Boolean(activeDoc.hasSelection),
      })
    : { ok: false as const, reason: 'Select a model with an image edit operation.' };
  const cost = selectedOperation
    ? estimateImageEditorOperationCostUsd({
        operationId: selectedOperation.id,
        providerId: provider as ImageEditorProviderId,
        modelId: effectiveModel,
      })
    : undefined;
  const costLabel = cost?.costUsd === undefined
    ? (cost?.unitLabel ?? 'provider-defined')
    : `~$${cost.costUsd.toFixed(3)} (${cost.unitLabel})`;
  const effectivePrompt = buildGenerativeFillPrompt({
    prompt: prompt.trim(),
    references: selectedOperation?.supportsReferenceImages ? references : [],
  });
  const requiresPrompt = selectedOperation?.supportsPrompt ?? true;
  const outpaintHasMargin = selectedOperation?.id !== 'outpaint'
    || outpaint.left + outpaint.right + outpaint.up + outpaint.down > 0;
  const canSubmit =
    !running &&
    Boolean(selectedOperation) &&
    runCheck.ok &&
    outpaintHasMargin &&
    (!requiresPrompt || Boolean(prompt.trim())) &&
    (!selectedOperation?.supportsSearchPrompt || Boolean(searchPrompt.trim()));

  const handleSubmit = async () => {
    if (!canSubmit || !selectedOperation) return;
    const estCost = cost?.costUsd ?? 0;
    if (estCost > COST_THRESHOLD_USD) {
      const ok = await useConfirmationStore.getState().requestConfirmation(
        `This generation is estimated at $${estCost.toFixed(3)}. Continue?`,
        'Budget Confirmation'
      );
      if (!ok) return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError(null);
    try {
      const selection = getSelection(activeDoc.id);
      if (!selection) throw new Error('No active selection — select an area before generating.');
      const capturedSelection = cloneMask(selection);
      const { source, mask, placementBounds } = await buildGenerativeFillRequestArtifacts(activeDoc, capturedSelection);
      const result = await runGenerativeFill({
        source,
        mask,
        prompt: effectivePrompt,
        provider,
        model: effectiveModel,
        operation: selectedOperation.id,
        searchPrompt: searchPrompt.trim(),
        outpaint: selectedOperation.id === 'outpaint' ? outpaint : undefined,
        references: selectedOperation.supportsReferenceImages ? references : [],
        abortSignal: controller.signal,
      });
      const newLayer = await createGenerativeFillLayerFromBlob({
        doc: activeDoc,
        edgeFeatherPx,
        placementBounds,
        png: result.png,
        prompt: prompt.trim() || selectedOperation.label,
        selection: capturedSelection,
      });
      addLayer(activeDoc.id, newLayer);
      useProjectUsageStore.getState().recordUsage({
        nodeId: `image:${activeDoc.id}`,
        nodeType: 'advancedImageEditor',
        nodeData: {},
        workspace: 'image',
        operation: selectedOperation.id,
        usage: {
          source: 'actual',
          confidence: cost?.costUsd === undefined ? 'unknown' : 'fixed',
          provider,
          modelId: effectiveModel,
          imageCount: 1,
          costUsd: cost?.costUsd,
          notes: cost?.notes,
        },
      });
      setPrompt('');
      setSearchPrompt('');
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError((err as Error).message);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const addReference = () => {
    const description = referenceDescription.trim();
    const imageUrl = referenceImageUrl.trim();
    if (!description && !imageUrl) return;
    setReferences((current) => [
      ...current,
      {
        id: `ref-${Date.now()}-${current.length}`,
        label: imageUrl ? `Reference ${current.length + 1}` : undefined,
        description,
        imageUrl: imageUrl || undefined,
      },
    ]);
    setReferenceDescription('');
    setReferenceImageUrl('');
  };

  return (
    <div
      data-image-generative-fill-bar="true"
      className="absolute z-50 flex flex-col gap-2 rounded-xl border border-cyan-300/30 bg-[#10151f]/95 p-2 shadow-2xl backdrop-blur"
      style={{
        left,
        maxHeight,
        overscrollBehavior: 'contain',
        overflowY: 'auto',
        top,
        width: panelWidth,
      }}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
        <Sparkles className="text-cyan-400" size={16} />
        <input
          autoFocus
          className="min-w-0 rounded border border-cyan-300/10 bg-[#0d0f15] px-2 py-1 text-sm text-cyan-50 placeholder:text-cyan-100/30"
          disabled={running || !selectedOperation?.supportsPrompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              void handleSubmit();
            }
            if (e.key === 'Escape') {
              useImageEditorStore.getState().setGenerativeFillDismissed(activeDoc.id, true);
            }
          }}
          placeholder={selectedOperation ? promptPlaceholder(selectedOperation.id) : 'Select an edit operation'}
          type="text"
          value={prompt}
        />
        <button
          aria-label="Dismiss generative edit"
          className="rounded p-1 text-cyan-100/40 hover:text-white"
          onClick={() => {
            useImageEditorStore.getState().setGenerativeFillDismissed(activeDoc.id, true);
          }}
          type="button"
        >
          <X size={14} />
        </button>
      </div>

      {maskDetector ? (
        <div className="mt-2 flex items-center gap-2">
          <input
            className="min-w-0 flex-1 rounded border border-cyan-300/10 bg-[#0d0f15] px-2 py-1 text-xs text-cyan-50 placeholder:text-cyan-100/30"
            disabled={detecting}
            onChange={(e) => setDetectPhrase(e.target.value)}
            placeholder={`Detect with ${maskDetector.label}, e.g. the sky`}
            value={detectPhrase}
          />
          <button
            className="shrink-0 rounded border border-cyan-300/30 bg-cyan-500/15 px-2 py-1 text-xs font-semibold text-cyan-50 hover:bg-cyan-500/25 disabled:opacity-50"
            disabled={detecting || !detectPhrase.trim()}
            onClick={() => void handleDetect()}
            type="button"
          >
            {detecting ? 'Detecting…' : 'Detect → select'}
          </button>
        </div>
      ) : null}

      <div className={primaryControlsClassName}>
        <select
          className="min-w-0 rounded border border-cyan-300/10 bg-[#0d0f15] px-2 py-1 text-xs text-cyan-100/80"
          disabled={running}
          onChange={(e) => {
            const nextProvider = e.target.value as GenerativeFillProvider;
            setProvider(nextProvider);
            setModel(getDefaultModelForProvider(nextProvider));
          }}
          value={provider}
        >
          {PROVIDER_LABELS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="min-w-0 rounded border border-cyan-300/10 bg-[#0d0f15] px-2 py-1 text-xs text-cyan-100/80"
          disabled={running}
          onChange={(e) => setModel(e.target.value)}
          value={effectiveModel}
        >
          {modelOptions.map((option) => (
            <option key={option.modelId} value={option.modelId}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          className="min-w-0 rounded border border-cyan-300/10 bg-[#0d0f15] px-2 py-1 text-xs text-cyan-100/80"
          disabled={running || operationOptions.length === 0}
          onChange={(e) => setOperation(e.target.value as ImageEditorOperationId)}
          value={selectedOperation?.id ?? effectiveOperationId ?? 'inpaint'}
        >
          {operationOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        {running ? (
          <button
            className="flex items-center justify-center gap-1 rounded bg-red-500/20 px-3 py-1 text-xs text-red-200 hover:bg-red-500/30"
            onClick={handleCancel}
            type="button"
          >
            <Loader2 className="animate-spin" size={12} />
            Cancel
          </button>
        ) : (
          <button
            className="rounded bg-cyan-400 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
            type="button"
          >
            Generate
          </button>
        )}
      </div>

      {selectedOperation?.supportsSearchPrompt && (
        <input
          className="rounded border border-cyan-300/10 bg-[#0d0f15] px-2 py-1 text-xs text-cyan-50 placeholder:text-cyan-100/30"
          disabled={running}
          onChange={(event) => setSearchPrompt(event.target.value)}
          placeholder="What should the provider search for?"
          value={searchPrompt}
        />
      )}

      {selectedOperation?.id === 'outpaint' && (
        <div className="grid grid-cols-5 gap-2 rounded border border-cyan-300/10 bg-[#0d0f15]/70 p-2">
          <SmallNumberField
            label="L"
            min={0}
            onChange={(value) => setOutpaint((current) => ({ ...current, left: value }))}
            value={outpaint.left}
          />
          <SmallNumberField
            label="R"
            min={0}
            onChange={(value) => setOutpaint((current) => ({ ...current, right: value }))}
            value={outpaint.right}
          />
          <SmallNumberField
            label="U"
            min={0}
            onChange={(value) => setOutpaint((current) => ({ ...current, up: value }))}
            value={outpaint.up}
          />
          <SmallNumberField
            label="D"
            min={0}
            onChange={(value) => setOutpaint((current) => ({ ...current, down: value }))}
            value={outpaint.down}
          />
          <SmallNumberField
            label="Cr"
            max={1}
            min={0}
            onChange={(value) => setOutpaint((current) => ({ ...current, creativity: value }))}
            step={0.05}
            value={outpaint.creativity}
          />
        </div>
      )}

      {selectedOperation?.id === 'inpaint' ? (
        <div className="grid grid-cols-[6rem_1fr_3rem] items-center gap-2 rounded border border-cyan-300/10 bg-[#0d0f15]/70 px-2 py-1">
          <span className="text-[11px] font-semibold text-cyan-100/45">Blend Edge</span>
          <input
            className="w-full accent-cyan-400"
            disabled={running}
            max={24}
            min={0}
            onChange={(event) => setEdgeFeatherPx(Number(event.target.value))}
            step={1}
            type="range"
            value={edgeFeatherPx}
          />
          <span className="text-right font-mono text-[11px] text-cyan-100/45">{edgeFeatherPx}px</span>
        </div>
      ) : null}

      {selectedOperation?.supportsReferenceImages && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={handleRefDrop}
          className="space-y-1.5 rounded border border-dashed border-cyan-400/25 bg-[#0d0f15]/80 p-2 text-center"
        >
          <div className="text-[10px] text-cyan-400/65 font-medium mb-1">
            Drag images from Source Library here or use options below:
          </div>
          <div className={referenceControlsClassName}>
            <input
              className={referenceInputClassName}
              disabled={running}
              onChange={(event) => setReferenceDescription(event.target.value)}
              placeholder="Description"
              value={referenceDescription}
            />
            <input
              className={referenceInputClassName}
              disabled={running}
              onChange={(event) => setReferenceImageUrl(event.target.value)}
              placeholder="Image URL"
              value={referenceImageUrl}
            />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={refFileInputRef}
              onChange={handleRefFileUpload}
            />
            <button
              className="rounded border border-cyan-300/15 bg-[#1b2230] px-2 py-1 text-xs font-semibold text-cyan-50 hover:border-cyan-300/40 disabled:opacity-40 cursor-pointer"
              disabled={running}
              onClick={() => refFileInputRef.current?.click()}
              title="Upload reference file from your machine"
              type="button"
            >
              Upload...
            </button>
            <button
              className="rounded border border-cyan-300/15 bg-[#1b2230] px-2 py-1 text-xs font-semibold text-cyan-50 hover:border-cyan-300/40 disabled:opacity-40 cursor-pointer"
              disabled={running || (!referenceDescription.trim() && !referenceImageUrl.trim())}
              onClick={addReference}
              type="button"
            >
              Add
            </button>
          </div>
          {referenceSlots.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1.5">
              {referenceSlots.map((reference) => (
                <button
                  className="max-w-[14rem] truncate rounded border border-cyan-300/10 bg-cyan-400/10 px-2 py-0.5 text-left text-[11px] text-cyan-100/70 hover:border-red-300/40 hover:text-red-100 cursor-pointer"
                  key={reference.id}
                  onClick={() => setReferences((current) => current.filter((item) => item.id !== reference.id))}
                  title={reference.removeTitle}
                  type="button"
                >
                  {reference.chipLabel}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-[11px] text-cyan-100/40">
        <span className="truncate">
          {runCheck.ok && !outpaintHasMargin
            ? 'Set at least one outpaint margin before generating.'
            : runCheck.ok ? selectedOperation?.description : runCheck.reason}
        </span>
        <span className="shrink-0 font-mono">{costLabel}</span>
      </div>
      {error && (
        <div className="truncate rounded bg-red-500/20 px-3 py-1 text-[11px] text-red-100">
          {error}
        </div>
      )}
    </div>
  );
}

function describeReferenceSlotLabel(
  reference: Pick<GenerativeFillReferenceInput, 'label' | 'description' | 'imageUrl'>,
  slotIndex: number,
): string {
  const label = reference.label?.trim();
  if (label) return label;
  const description = reference.description?.trim();
  if (description) return description;
  const imageUrl = reference.imageUrl?.trim();
  if (imageUrl?.startsWith('data:')) return 'Embedded image';
  if (imageUrl) return 'Image URL reference';
  return `Reference ${slotIndex}`;
}

function describeReferenceSlotSource(
  reference: Pick<GenerativeFillReferenceInput, 'description' | 'imageUrl'>,
): string {
  const hasDescription = Boolean(reference.description?.trim());
  const imageUrl = reference.imageUrl?.trim() ?? '';
  const imageKind = imageUrl.startsWith('data:')
    ? 'embedded image'
    : imageUrl
      ? 'image URL'
      : null;

  if (imageKind && hasDescription) return `${imageKind} + description`;
  if (imageKind) return imageKind;
  if (hasDescription) return 'description';
  return 'empty reference';
}

function getModelOptions(provider: GenerativeFillProvider): Array<{ modelId: string; label: string }> {
  if (provider === 'generic') {
    return [{ modelId: 'generic-http', label: 'Generic HTTP' }];
  }

  return listImageModelDefinitions(provider as FirstClassImageProviderId)
    .filter((definition) =>
      getImageEditorOperationsForModel(provider as ImageEditorProviderId, definition.modelId)
        .some((operation) => !operation.localOnly),
    )
    .map((definition) => ({ modelId: definition.modelId, label: definition.label }));
}

function getDefaultModelForProvider(provider: GenerativeFillProvider): string {
  return getModelOptions(provider)[0]?.modelId ?? 'generic-http';
}

function promptPlaceholder(operation: ImageEditorOperationId): string {
  switch (operation) {
    case 'searchReplace':
      return 'Describe the replacement…';
    case 'searchRecolor':
      return 'Describe the new color or material…';
    case 'removeBackground':
      return 'This operation does not require a prompt';
    case 'replaceBackground':
      return 'Describe the new background…';
    case 'relight':
      return 'Describe the lighting change…';
    case 'outpaint':
      return 'Describe what should continue beyond the canvas…';
    case 'upscale':
      return 'This operation does not require a prompt';
    case 'resizeImage':
    case 'resizeCanvas':
      return 'Use the document controls in Properties';
    case 'inpaint':
      return 'Describe what to fill the selection with…';
    case 'erase':
      return 'No prompt required';
  }
}

function SmallNumberField(props: {
  label: string;
  min: number;
  max?: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid grid-cols-[1.25rem_1fr] items-center gap-1">
      <span className="text-[11px] font-semibold text-cyan-100/45">{props.label}</span>
      <input
        className="min-w-0 rounded border border-cyan-300/10 bg-[#070a10] px-1 py-1 font-mono text-xs text-cyan-50"
        max={props.max}
        min={props.min}
        onChange={(event) => props.onChange(Number(event.target.value))}
        step={props.step ?? 1}
        type="number"
        value={props.value}
      />
    </label>
  );
}
