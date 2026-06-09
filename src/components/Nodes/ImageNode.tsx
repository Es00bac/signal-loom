import { memo, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Handle, Position } from '@xyflow/react';
import { Download, Image as ImageIcon, Maximize2, Upload, X } from 'lucide-react';
import { AttemptHistory } from './AttemptHistory';
import { BaseNode } from './BaseNode';
import { ExecutionTelemetryPanel } from './ExecutionTelemetryPanel';
import { ImageGenerationProgressBackdrop } from './ImageGenerationProgressBackdrop';
import { ImagePreviewPane } from './ImagePreviewPane';
import { MediaLoadingOverlay } from './MediaLoadingOverlay';
import { MediaPreviewModal } from './MediaPreviewModal';
import { ImageMaskPainterDialog } from './ImageMaskPainterDialog';
import { saveImportedAsset } from '../../lib/assetStore';
import { buildDownloadFilename, downloadAsset } from '../../lib/downloadAsset';
import { EXPORT_BASENAME } from '../../lib/brand';
import { withFlowNodeInteractionClasses } from '../../lib/flowNodeInteraction';
import { getImageGenerationProgressDetail } from '../../lib/imageGenerationProgress';
import {
  hasConnectedImageEditSource,
  hasConnectedImageMaskSource,
  hasConnectedImageReferenceSource,
  resolveConnectedImageEditAsset,
  resolveConnectedImageMaskAsset,
  resolveConnectedImageReferenceAsset,
} from '../../lib/imageEditConnections';
import {
  IMAGE_REFERENCE_HANDLES,
  supportsImageEditing,
  supportsImageReferenceGuidance,
} from '../../lib/imageModelSupport';
import {
  getImageNodeControlModel,
  type ImageNodeVisibleControl,
} from '../../lib/imageProviderCapabilities';
import {
  getImageNodeCapabilityBadges,
  getImageNodeOperationCostRows,
} from '../../lib/imageNodeTemplates';
import { getCompatibleNodeActions } from '../../lib/nodeActionMenu';
import { assignVariableToResultAttempt } from '../../lib/flowVariables';
import { resolveUniversalConfiguredUpscalePlan } from '../../lib/universalImageUpscale';
import { hasConnectedVideoSource } from '../../lib/videoSourceConnections';
import {
  getConfiguredProviders,
  getImageAspectRatioOptions,
  getModelOptions,
  getProviderLabel,
  getSupportedImageAspectRatio,
  IMAGE_OUTPUT_FORMAT_OPTIONS,
  IMAGE_STEP_OPTIONS,
} from '../../lib/providerCatalog';
import { useFlowStore } from '../../store/flowStore';
import { useSourceBinStore } from '../../store/sourceBinStore';
import { useConfirmationStore } from '../../store/confirmationStore';
import { useCatalogStore } from '../../store/catalogStore';
import { useSettingsStore } from '../../store/settingsStore';
import type {
  AppNodeProps,
  ImageProvider,
  MediaNodeMode,
  VideoFrameSelection,
} from '../../types/flow';

type ImageReferenceHandle = (typeof IMAGE_REFERENCE_HANDLES)[number];

interface ImageReferenceConnectionState {
  handleId: ImageReferenceHandle;
  imageUrl?: string;
  isConnected: boolean;
}

const selectClassName = withFlowNodeInteractionClasses(
  'w-full bg-[#111217]/50 text-gray-200 border border-gray-700/60 rounded-lg p-2 text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none shadow-inner',
);

const actionButtonClassName = withFlowNodeInteractionClasses(
  'inline-flex items-center gap-1 rounded-lg border border-gray-700/60 bg-[#111217]/40 px-2.5 py-1.5 text-[11px] font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white',
);

const textInputClassName = withFlowNodeInteractionClasses(
  'w-full rounded-lg border border-gray-700/60 bg-[#111217]/50 px-2.5 py-2 text-xs font-medium text-gray-200 outline-none focus:ring-2 focus:ring-blue-500',
);

function ImageNodeComponent({ id, data }: AppNodeProps) {
  const apiKeys = useSettingsStore((state) => state.apiKeys);
  const providerSettings = useSettingsStore((state) => state.providerSettings);
  const defaultModels = useSettingsStore((state) => state.defaultModels.image);
  const modelCatalog = useCatalogStore((state) => state.modelCatalog);
  const mediaMode = (data.mediaMode ?? 'generate') as MediaNodeMode;
  const isCollapsed = Boolean(data.collapsed);
  const onDataChange = data.onChange;
  const currentAspectRatio = data.aspectRatio;
  const [isPreviewOpen, setPreviewOpen] = useState(false);
  const [isMaskPainterOpen, setMaskPainterOpen] = useState(false);
  const availableProviders = useMemo(
    () => getConfiguredProviders('image', apiKeys, providerSettings),
    [apiKeys, providerSettings],
  );
  const provider = ((data.provider as ImageProvider | undefined) ?? availableProviders[0] ?? 'gemini') as ImageProvider;
  const getDefaultImageModel = (imageProvider: ImageProvider) => (
    imageProvider === 'android'
      ? providerSettings.androidAcceleratorDefaultImageModel ?? defaultModels[imageProvider]
      : defaultModels[imageProvider]
  );
  const selectedModelId = data.modelId ?? getDefaultImageModel(provider);
  const controlModel = getImageNodeControlModel(provider, selectedModelId);
  const capabilityBadges = useMemo(
    () => getImageNodeCapabilityBadges(provider, selectedModelId),
    [provider, selectedModelId],
  );
  const operationCostRows = useMemo(
    () => getImageNodeOperationCostRows(provider, selectedModelId),
    [provider, selectedModelId],
  );
  const autoUpscalePlan = useMemo(
    () => resolveUniversalConfiguredUpscalePlan({ apiKeys, providerSettings }),
    [apiKeys, providerSettings],
  );
  const autoUpscaleEnabled = Boolean(data.imageAutoUpscale);
  const hasControl = (control: ImageNodeVisibleControl) => controlModel.visibleControls.includes(control);
  const visibleReferenceHandles = IMAGE_REFERENCE_HANDLES.slice(
    0,
    Math.max(0, Math.min(IMAGE_REFERENCE_HANDLES.length, controlModel.capabilities.maxReferenceImages)),
  );
  const assetUrl = mediaMode === 'import' ? data.sourceAssetUrl : data.result;
  const assetMimeType = mediaMode === 'import' ? data.sourceAssetMimeType : 'image/png';
  const isImageGenerating = Boolean(data.isRunning);

  const connections = useFlowStore(
    useShallow((state) => ({
      hasVideoSourceConnection: hasConnectedVideoSource(state.nodes, state.edges, id),
      hasEditSourceConnection: hasConnectedImageEditSource(state.nodes, state.edges, id),
      hasMaskConnection: hasConnectedImageMaskSource(state.nodes, state.edges, id),
      editSourcePreviewUrl: resolveConnectedImageEditAsset(state.nodes, state.edges, id),
      maskPreviewUrl: resolveConnectedImageMaskAsset(state.nodes, state.edges, id),
      referenceStateJson: JSON.stringify(visibleReferenceHandles.map((handleId) => ({
        handleId,
        imageUrl: resolveConnectedImageReferenceAsset(state.nodes, state.edges, id, [handleId]),
        isConnected: hasConnectedImageReferenceSource(state.nodes, state.edges, id, [handleId]),
      } satisfies ImageReferenceConnectionState))),
    })),
  );
  const {
    hasVideoSourceConnection,
    hasEditSourceConnection,
    hasMaskConnection,
    editSourcePreviewUrl,
    maskPreviewUrl,
    referenceStateJson,
  } = connections;
  const references = useMemo<ImageReferenceConnectionState[]>(() => {
    try {
      const parsed = JSON.parse(referenceStateJson) as ImageReferenceConnectionState[];
      return parsed.filter((reference): reference is ImageReferenceConnectionState =>
        IMAGE_REFERENCE_HANDLES.includes(reference.handleId) &&
        typeof reference.isConnected === 'boolean' &&
        (reference.imageUrl === undefined || typeof reference.imageUrl === 'string'));
    } catch {
      return [];
    }
  }, [referenceStateJson]);
  const hasReferenceConnections = references.some((reference) => reference.isConnected);
  const canEditConnectedImage = supportsImageEditing(provider, selectedModelId);
  const canUseReferenceGuidance = supportsImageReferenceGuidance(provider, selectedModelId);
  const paintedMaskUrl = typeof data.imagePaintedMaskDataUrl === 'string' ? data.imagePaintedMaskDataUrl : undefined;
  const effectiveMaskPreviewUrl = maskPreviewUrl ?? paintedMaskUrl;
  const hasPaintedMask = Boolean(paintedMaskUrl);
  const parsedMaskBrushSize = Number(data.imageMaskBrushSize);
  const maskBrushSize = Number.isFinite(parsedMaskBrushSize)
    ? Math.max(4, Math.min(160, parsedMaskBrushSize))
    : 36;
  const maskPainterMode = hasControl('outpaintMargins') && !hasControl('mask') ? 'outpaint' : 'mask';
  const canOpenMaskPainter = Boolean(editSourcePreviewUrl);
  const isVideoFrameMode = mediaMode === 'generate' && hasVideoSourceConnection;
  const isEditingMode = mediaMode === 'generate' && hasEditSourceConnection;
  const isReferenceGuidedMode = mediaMode === 'generate' && !isEditingMode && hasReferenceConnections;
  const selectedVideoFrame = (data.videoFrameSelection as VideoFrameSelection | undefined) ?? 'last';
  const configuredAspectRatio = getSupportedImageAspectRatio(
    provider,
    selectedModelId,
    data.aspectRatio as string | undefined,
  );
  const aspectRatioOptions = getImageAspectRatioOptions(provider, selectedModelId);

  useEffect(() => {
    if (mediaMode !== 'generate' || availableProviders.length === 0 || availableProviders.includes(provider)) {
      return;
    }

    const nextProvider = availableProviders[0];
    onDataChange?.('provider', nextProvider);
    onDataChange?.('modelId', defaultModels[nextProvider]);
  }, [availableProviders, defaultModels, mediaMode, onDataChange, provider]);

  useEffect(() => {
    if (mediaMode !== 'generate' || isVideoFrameMode || currentAspectRatio === configuredAspectRatio) {
      return;
    }

    onDataChange?.('aspectRatio', configuredAspectRatio);
  }, [configuredAspectRatio, currentAspectRatio, isVideoFrameMode, mediaMode, onDataChange]);

  const handleModeChange = (nextMode: MediaNodeMode) => {
    data.onChange?.('mediaMode', nextMode);
    data.onChange?.('error', undefined);
    data.onChange?.('statusMessage', nextMode === 'import' ? 'Choose an image from your device.' : undefined);

    if (nextMode === 'import') {
      data.onChange?.('result', undefined);
      return;
    }

    if (availableProviders.length > 0) {
      const nextProvider = availableProviders.includes(provider) ? provider : availableProviders[0];
      data.onChange?.('provider', nextProvider);
      data.onChange?.('modelId', data.modelId ?? getDefaultImageModel(nextProvider));
    }
  };

  const handleProviderChange = (nextProvider: ImageProvider) => {
    const nextModelId = getDefaultImageModel(nextProvider);
    data.onChange?.('provider', nextProvider);
    data.onChange?.('modelId', nextModelId);
    data.onChange?.(
      'aspectRatio',
      getSupportedImageAspectRatio(nextProvider, nextModelId, data.aspectRatio as string | undefined),
    );
  };

  const handleModelChange = (nextModelId: string) => {
    data.onChange?.('modelId', nextModelId);
    data.onChange?.(
      'aspectRatio',
      getSupportedImageAspectRatio(provider, nextModelId, data.aspectRatio as string | undefined),
    );
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    try {
      const storedAsset = await saveImportedAsset(file);
      data.onChange?.('sourceAssetId', storedAsset.id);
      data.onChange?.('sourceAssetUrl', storedAsset.dataUrl);
      data.onChange?.('sourceAssetName', storedAsset.name);
      data.onChange?.('sourceAssetMimeType', storedAsset.mimeType);
      data.onChange?.('result', undefined);
      data.onChange?.('error', undefined);
      data.onChange?.('statusMessage', `Imported ${storedAsset.name}`);
    } catch (error) {
      data.onChange?.('error', error instanceof Error ? error.message : 'Image import failed.');
    }
  };

  const handleDownload = async () => {
    if (!assetUrl) {
      return;
    }

    await downloadAsset(
      assetUrl,
      buildDownloadFilename(data.sourceAssetName ?? `${EXPORT_BASENAME}-image`, assetMimeType, 'png'),
    );
  };

  const modelOptions = getModelOptions(
    'image',
    provider,
    modelCatalog,
    data.modelId ?? defaultModels[provider],
  );

  const previewPanel = (
    <div className="relative group mt-1">
      {isImageGenerating && !assetUrl ? (
        <ImageGenerationProgressBackdrop />
      ) : (
        <button
          className={withFlowNodeInteractionClasses('block w-full text-left')}
          disabled={!assetUrl}
          onClick={() => setPreviewOpen(true)}
          title={assetUrl ? 'Open image preview' : undefined}
          type="button"
        >
          <ImagePreviewPane
            alt="Flow node output"
            fallbackAspectRatio={configuredAspectRatio}
            imageMaxHeightClassName={
              isImageGenerating ? 'max-h-[18rem] scale-[1.02] blur-[2px] opacity-60' : 'max-h-[18rem]'
            }
            minHeightClassName="min-h-[9rem]"
            placeholder={(
              <div className="flex flex-col items-center justify-center text-gray-500">
                <ImageIcon size={24} className="mb-2 opacity-50" />
                <span className="text-center text-[11px] font-medium tracking-wide">
                  {mediaMode === 'import'
                    ? 'Import a local image'
                    : isVideoFrameMode
                      ? `Run to extract the ${selectedVideoFrame} frame from the connected video`
                    : isEditingMode
                      ? 'Run with a prompt to edit the connected source image'
                    : isReferenceGuidedMode
                      ? 'Run with a prompt to generate from the connected reference images'
                      : 'Run with an upstream prompt'}
                </span>
              </div>
            )}
            src={assetUrl}
          />
        </button>
      )}

      {assetUrl && !isImageGenerating ? (
        <button
          className={withFlowNodeInteractionClasses(
            'absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-red-500/50 bg-black/75 text-red-400 transition-all hover:scale-110 hover:border-red-500 hover:bg-red-500 hover:text-white shadow-lg cursor-pointer'
          )}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void (async () => {
              const confirmed = await useConfirmationStore.getState().requestConfirmation(
                'Delete this image? It will be removed from your project source library and canvas envelopes.',
                'Delete Image',
              );
              if (!confirmed) {
                return;
              }

              const sourceBinState = useSourceBinStore.getState();
              const matchedItem = sourceBinState.getAllItems().find((item) => item.assetUrl === assetUrl);
              if (matchedItem) {
                sourceBinState.removeItem(matchedItem.id);
              }

              // Clear generated result fields
              data.onChange?.('result', undefined);
              data.onChange?.('resultType', undefined);
              data.onChange?.('resultMimeType', undefined);
              data.onChange?.('resultExtension', undefined);
              data.onChange?.('resultFileName', undefined);
              data.onChange?.('resultHistory', undefined);
              data.onChange?.('selectedResultId', undefined);

              // Also clear imported asset fields if in import mode
              if (mediaMode === 'import') {
                data.onChange?.('sourceAssetId', undefined);
                data.onChange?.('sourceAssetUrl', undefined);
                data.onChange?.('sourceAssetName', undefined);
                data.onChange?.('sourceAssetMimeType', undefined);
              }
            })();
          }}
          title="Delete image"
          type="button"
        >
          <X size={12} />
        </button>
      ) : null}

      {isImageGenerating ? (
        <MediaLoadingOverlay
          detail={getImageGenerationProgressDetail(Boolean(assetUrl))}
          title="Generating image"
        />
      ) : null}
    </div>
  );

  const importedAssetNamePanel =
    mediaMode === 'import' && data.sourceAssetName ? (
      <div className="rounded-lg border border-gray-700/60 bg-[#111217]/30 px-2.5 py-2 text-[11px] text-gray-300">
        {data.sourceAssetName}
      </div>
    ) : null;

  return (
    <BaseNode
      collapsedContent={
        <div className="space-y-2">
          {previewPanel}
          {importedAssetNamePanel}
        </div>
      }
      nodeId={id}
      icon={ImageIcon}
      nodeType="imageGen"
      isCollapsed={isCollapsed}
      title={
        mediaMode === 'import'
          ? 'Image Asset'
          : isVideoFrameMode
            ? 'Video Frame'
          : isEditingMode
            ? 'Image Editing'
          : isReferenceGuidedMode
            ? 'Reference-Guided Image'
            : 'Image Generation'
      }
      outputActions={getCompatibleNodeActions('imageGen')}
      onRun={mediaMode === 'generate' ? data.onRun : undefined}
      isRunning={data.isRunning}
      error={data.error}
      statusMessage={data.statusMessage}
      retryState={data.retryState}
      onToggleCollapsed={() => data.onChange?.('collapsed', !isCollapsed)}
      footerActions={
        assetUrl ? (
          <button className={actionButtonClassName} onClick={() => void handleDownload()} type="button">
            <Download size={12} />
            Save
          </button>
        ) : null
      }
    >
      {mediaMode === 'generate' ? (
        <AttemptHistory
          attempts={data.resultHistory}
          onAssignVariable={(attemptId, variableName) => data.onChange?.('resultHistory', assignVariableToResultAttempt(data.resultHistory, attemptId, variableName))}
          onSelectAttempt={data.onSelectAttempt}
          selectedAttemptId={data.selectedResultId}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <ModeButton active={mediaMode === 'generate'} label="Generate" onClick={() => handleModeChange('generate')} />
        <ModeButton active={mediaMode === 'import'} label="Import" onClick={() => handleModeChange('import')} />
      </div>

      {mediaMode === 'generate' ? (
        <>
          {isVideoFrameMode ? (
            <>
              <select
                className={selectClassName}
                onChange={(event) => data.onChange?.('videoFrameSelection', event.target.value)}
                value={selectedVideoFrame}
              >
                <option value="last">Last video frame</option>
                <option value="first">First video frame</option>
              </select>

              <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-2.5 py-2 text-[11px] text-blue-100">
                An upstream video is connected. This node will extract the selected frame locally without calling an image model.
              </div>
            </>
          ) : availableProviders.length > 0 ? (
            <>
              <select
                className={selectClassName}
                onChange={(event) => handleProviderChange(event.target.value as ImageProvider)}
                value={provider}
              >
                {availableProviders.map((option) => (
                  <option key={option} value={option}>
                    {getProviderLabel(option)}
                  </option>
                ))}
              </select>

              <select
                className={selectClassName}
                onChange={(event) => handleModelChange(event.target.value)}
                value={selectedModelId}
              >
                {modelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-100">
              Add a {getProviderLabel(provider)} key or endpoint in Settings to run this model.
              <div className="mt-1 text-amber-100/80">
                Selected model: {selectedModelId}
              </div>
            </div>
          )}

          {!isVideoFrameMode ? (
            <>
              {hasControl('aspectRatio') && aspectRatioOptions.length > 0 ? (
                <select
                  className={selectClassName}
                  onChange={(event) => data.onChange?.('aspectRatio', event.target.value)}
                  value={configuredAspectRatio}
                >
                  {aspectRatioOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : null}

              {hasControl('steps') ? (
                <select
                  className={selectClassName}
                  onChange={(event) => data.onChange?.('steps', Number(event.target.value))}
                  value={String(data.steps ?? 30)}
                >
                  {IMAGE_STEP_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : null}

              {hasControl('seed') ? (
                <input
                  className={textInputClassName}
                  min={0}
                  onChange={(event) => data.onChange?.(
                    'imageSeed',
                    event.target.value === '' ? undefined : Number(event.target.value),
                  )}
                  placeholder="Seed"
                  type="number"
                  value={data.imageSeed === undefined ? '' : String(data.imageSeed)}
                />
              ) : null}

              {hasControl('guidanceScale') ? (
                <input
                  className={textInputClassName}
                  max={20}
                  min={0}
                  onChange={(event) => data.onChange?.(
                    'imageGuidanceScale',
                    event.target.value === '' ? undefined : Number(event.target.value),
                  )}
                  placeholder="Guidance scale"
                  step={0.5}
                  type="number"
                  value={data.imageGuidanceScale === undefined ? '' : String(data.imageGuidanceScale)}
                />
              ) : null}

              {hasControl('editStrength') ? (
                <label className="space-y-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Edit strength
                  <input
                    className={withFlowNodeInteractionClasses('w-full accent-blue-500')}
                    max={1}
                    min={0}
                    onChange={(event) => data.onChange?.('imageEditStrength', Number(event.target.value))}
                    step={0.05}
                    type="range"
                    value={String(data.imageEditStrength ?? 0.65)}
                  />
                </label>
              ) : null}

              {hasControl('loraWeights') ? (
                <textarea
                  className={`${textInputClassName} min-h-16 resize-y`}
                  onChange={(event) => data.onChange?.('imageLoraWeightsJson', event.target.value)}
                  placeholder="LoRA JSON for Atlas, e.g. [{&quot;path&quot;:&quot;...&quot;,&quot;scale&quot;:0.8}]"
                  value={data.imageLoraWeightsJson ?? ''}
                />
              ) : null}

              {hasControl('safetyChecker') ? (
                <label className={withFlowNodeInteractionClasses('flex items-start gap-2 rounded-lg border border-gray-700/50 bg-[#111217]/30 px-2.5 py-2 text-[11px] text-gray-300 hover:border-gray-600')}>
                  <input
                    checked={data.imageSafetyCheckerEnabled ?? true}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-blue-400"
                    onChange={(event) => data.onChange?.('imageSafetyCheckerEnabled', event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    <span className="block font-semibold text-gray-100">Provider safety checker</span>
                    <span className="mt-0.5 block leading-4 text-gray-400">
                      Pass the Atlas model-level safety checker flag when the model supports it.
                    </span>
                  </span>
                </label>
              ) : null}

              {hasControl('outputFormat') ? (
                <select
                  className={selectClassName}
                  onChange={(event) => data.onChange?.('imageOutputFormat', event.target.value)}
                  value={data.imageOutputFormat ?? 'png'}
                >
                  {IMAGE_OUTPUT_FORMAT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : null}

              {hasControl('searchPrompt') ? (
                <input
                  className={textInputClassName}
                  onChange={(event) => data.onChange?.('imageSearchPrompt', event.target.value)}
                  placeholder="Object to find, e.g. red mug"
                  type="text"
                  value={data.imageSearchPrompt ?? ''}
                />
              ) : null}

              {hasControl('exactColorPrompt') ? (
                <input
                  className={textInputClassName}
                  onChange={(event) => data.onChange?.('imageExactColor', event.target.value)}
                  placeholder="Exact color or palette, e.g. #0057ff"
                  type="text"
                  value={data.imageExactColor ?? ''}
                />
              ) : null}

              {hasControl('textEditPrompt') ? (
                <input
                  className={textInputClassName}
                  onChange={(event) => data.onChange?.('imageTextEditPrompt', event.target.value)}
                  placeholder="Text edit target, e.g. replace sign with OPEN LATE"
                  type="text"
                  value={data.imageTextEditPrompt ?? ''}
                />
              ) : null}

              {hasControl('outpaintMargins') ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { field: 'imageOutpaintLeft', label: 'L' },
                      { field: 'imageOutpaintRight', label: 'R' },
                      { field: 'imageOutpaintUp', label: 'U' },
                      { field: 'imageOutpaintDown', label: 'D' },
                    ].map(({ field, label }) => (
                      <label key={field} className="space-y-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                        {label}
                        <input
                          className={textInputClassName}
                          min={0}
                          onChange={(event) => data.onChange?.(field, Number(event.target.value))}
                          step={64}
                          type="number"
                          value={String(Number(data[field] ?? 0))}
                        />
                      </label>
                    ))}
                  </div>
                  <button
                    className={`${actionButtonClassName} w-full justify-center disabled:cursor-not-allowed disabled:opacity-50`}
                    disabled={!canOpenMaskPainter}
                    onClick={() => setMaskPainterOpen(true)}
                    type="button"
                  >
                    <Maximize2 size={12} />
                    Open outpaint workspace
                  </button>
                </div>
              ) : null}

              {hasControl('creativity') ? (
                <label className="space-y-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Creativity
                  <input
                    className={withFlowNodeInteractionClasses('w-full accent-blue-500')}
                    max={1}
                    min={0}
                    onChange={(event) => data.onChange?.('imageCreativity', Number(event.target.value))}
                    step={0.05}
                    type="range"
                    value={String(data.imageCreativity ?? 0.35)}
                  />
                </label>
              ) : null}

              <label className={withFlowNodeInteractionClasses(`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px] transition-colors ${
                autoUpscaleEnabled
                  ? 'border-cyan-400/35 bg-cyan-500/10 text-cyan-50'
                  : 'border-gray-700/50 bg-[#111217]/30 text-gray-400 hover:border-gray-600'
              }`)}>
                <input
                  checked={autoUpscaleEnabled}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-cyan-400"
                  onChange={(event) => data.onChange?.('imageAutoUpscale', event.target.checked)}
                  type="checkbox"
                />
                <span className="min-w-0">
                  <span className="block font-semibold text-gray-100">Auto-upscale result</span>
                  <span className="mt-0.5 block leading-4 text-gray-400">
                    {autoUpscalePlan.label} · {autoUpscalePlan.canRun ? autoUpscalePlan.costLabel : 'not configured'}
                  </span>
                  {autoUpscaleEnabled && !autoUpscalePlan.canRun ? (
                    <span className="mt-1 block leading-4 text-amber-200">
                      {autoUpscalePlan.unavailableReason ?? 'Choose a configured upscaler in Settings.'}
                    </span>
                  ) : null}
                </span>
              </label>

              <ImageModelSummary
                autoUpscale={autoUpscaleEnabled ? {
                  canRun: autoUpscalePlan.canRun,
                  costLabel: autoUpscalePlan.costLabel,
                  label: autoUpscalePlan.label,
                } : undefined}
                capabilityBadges={capabilityBadges}
                costRows={operationCostRows}
                fallbackCostLabel={controlModel.costEstimateLabel}
                showEndpointNote={hasControl('localEndpoint')}
              />
            </>
          ) : null}
        </>
      ) : (
        <label className={`${actionButtonClassName} justify-center cursor-pointer`}>
          <Upload size={12} />
          {data.sourceAssetName ? 'Replace Image' : 'Import Image'}
          <input
            accept="image/*"
            className="hidden"
            onChange={(event) => void handleImport(event.target.files?.[0])}
            type="file"
          />
        </label>
      )}

      {isEditingMode && !isVideoFrameMode ? (
        canEditConnectedImage ? (
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-2.5 py-2 text-[11px] text-blue-100">
            An upstream image is connected as the editable base image. This node will modify that source image with the current prompt.
          </div>
        ) : (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-100">
            The selected provider/model is currently wired for text-to-image only in this app. Switch to a Gemini image model or GPT Image to edit the connected source image.
          </div>
        )
      ) : null}

      {hasReferenceConnections && !isVideoFrameMode ? (
        canUseReferenceGuidance ? (
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-2.5 py-2 text-[11px] text-blue-100">
            Reference images are connected. This model will use them as style, asset, character, or composition guidance rather than treating them as the editable base image.
          </div>
        ) : (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-100">
            The selected model does not accept reference images. Switch to a reference-capable image model to use connected references.
          </div>
        )
      ) : null}

      {mediaMode === 'generate' && !isVideoFrameMode && (canEditConnectedImage || canUseReferenceGuidance || hasControl('mask')) ? (
        <>
          {canEditConnectedImage ? (
            <ImageEditSourceSlot imageUrl={editSourcePreviewUrl} isConnected={hasEditSourceConnection} />
          ) : null}
          {hasControl('mask') ? (
            <ImageMaskSlot
              canOpenPainter={canOpenMaskPainter}
              hasPaintedMask={hasPaintedMask}
              imageUrl={effectiveMaskPreviewUrl}
              isConnected={hasMaskConnection}
              onOpenPainter={() => setMaskPainterOpen(true)}
            />
          ) : null}
          {canUseReferenceGuidance ? (
            <div className="grid grid-cols-2 gap-2">
              {references.map((reference, index) => (
                <ImageReferenceSlot
                  handleId={reference.handleId}
                  imageUrl={reference.imageUrl}
                  isConnected={reference.isConnected}
                  key={reference.handleId}
                  label={`Reference ${index + 1}`}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {isVideoFrameMode && (hasEditSourceConnection || hasReferenceConnections) ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-100">
          A video source is connected, so this node is currently in frame-extraction mode. Disconnect the upstream video if you want to use image editing or reference guidance instead.
        </div>
      ) : null}

      <ExecutionTelemetryPanel nodeId={id} usage={data.usage} />

      {previewPanel}

      {importedAssetNamePanel}
      {assetUrl && isPreviewOpen ? (
        <MediaPreviewModal
          kind="image"
          label={data.sourceAssetName ?? data.modelId ?? 'Image'}
          onClose={() => setPreviewOpen(false)}
          src={assetUrl}
        />
      ) : null}
      {isMaskPainterOpen && editSourcePreviewUrl ? (
        <ImageMaskPainterDialog
          brushSize={maskBrushSize}
          initialMaskDataUrl={paintedMaskUrl}
          mode={maskPainterMode}
          onBrushSizeChange={(size) => data.onChange?.('imageMaskBrushSize', size)}
          onClose={() => setMaskPainterOpen(false)}
          onSave={(maskDataUrl) => {
            data.onChange?.('imagePaintedMaskDataUrl', maskDataUrl);
            data.onChange?.('imagePaintedMaskUpdatedAt', Date.now());
            setMaskPainterOpen(false);
          }}
          sourceImageUrl={editSourcePreviewUrl}
        />
      ) : null}
    </BaseNode>
  );
}

export const ImageNode = memo(ImageNodeComponent);

interface ImageModelSummaryProps {
  autoUpscale?: {
    canRun: boolean;
    costLabel: string;
    label: string;
  };
  capabilityBadges: string[];
  costRows: ReturnType<typeof getImageNodeOperationCostRows>;
  fallbackCostLabel: string;
  showEndpointNote: boolean;
}

function ImageModelSummary({
  autoUpscale,
  capabilityBadges,
  costRows,
  fallbackCostLabel,
  showEndpointNote,
}: ImageModelSummaryProps) {
  return (
    <div className="space-y-2 rounded-lg border border-gray-700/50 bg-[#111217]/30 px-2.5 py-2 text-[10px] text-gray-400">
      <div>
        <div className="mb-1 font-semibold uppercase tracking-[0.14em] text-gray-500">Capabilities</div>
        {capabilityBadges.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {capabilityBadges.map((badge) => (
              <span
                className="rounded border border-gray-700/70 bg-[#0c1018] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-gray-300"
                key={badge}
              >
                {badge}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-gray-500">Generation only</div>
        )}
      </div>
      <div>
        <div className="mb-1 font-semibold uppercase tracking-[0.14em] text-gray-500">Pre-run cost</div>
        {costRows.length > 0 ? (
          <div className="grid gap-1">
            {costRows.map((row) => (
              <div className="flex items-center justify-between gap-2" key={row.operation}>
                <span className="truncate text-gray-400">{row.label}</span>
                <span className="shrink-0 text-gray-200">{row.estimateLabel}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-gray-200">{fallbackCostLabel}</div>
        )}
        {autoUpscale ? (
          <div className="mt-1 flex items-center justify-between gap-2 border-t border-gray-800/80 pt-1">
            <span className="truncate text-gray-400">Auto-upscale · {autoUpscale.label}</span>
            <span className={`shrink-0 ${autoUpscale.canRun ? 'text-cyan-100' : 'text-amber-200'}`}>
              {autoUpscale.canRun ? autoUpscale.costLabel : 'not configured'}
            </span>
          </div>
        ) : null}
      </div>
      {showEndpointNote ? (
        <div className="rounded border border-blue-500/20 bg-blue-500/10 px-2 py-1.5 text-[10px] leading-4 text-blue-100">
          Uses the Local/Open endpoint and auth header from Settings.
        </div>
      ) : null}
    </div>
  );
}

interface ModeButtonProps {
  active: boolean;
  label: string;
  onClick: () => void;
}

function ModeButton({ active, label, onClick }: ModeButtonProps) {
  return (
    <button
      className={withFlowNodeInteractionClasses(`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
        active ? 'bg-blue-500 text-white' : 'bg-[#111217]/40 text-gray-400 hover:text-white'
      }`)}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

interface EditSourcePreviewProps {
  isConnected: boolean;
  imageUrl?: string;
}

function ImageEditSourceSlot({ imageUrl, isConnected }: EditSourcePreviewProps) {
  return (
    <div className="relative rounded-lg border border-gray-700/60 bg-[#111217]/35 p-2 pl-5">
      <Handle
        id="image-edit-source"
        type="target"
        position={Position.Left}
        className={`nodrag nopan !left-0 !top-1/2 !-translate-x-1/2 !-translate-y-1/2 !w-6 !h-6 !border-[3px] !border-[#1e2027] ${isConnected ? '!bg-emerald-500' : '!bg-blue-500'}`}
      />
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">
        Source Image
      </div>
      <ImagePreviewPane
        alt="Connected image edit source"
        fallbackAspectRatio="1:1"
        imageMaxHeightClassName="max-h-24"
        minHeightClassName="min-h-[5.5rem]"
        placeholder={(
          <div className="px-4 text-center text-[10px] text-gray-500">
            {isConnected
              ? 'An image source is wired. The preview appears after the upstream image is generated or imported.'
              : 'Connect the image you want this node to edit.'}
          </div>
        )}
        src={imageUrl}
      />
    </div>
  );
}

interface ImageMaskSlotProps extends EditSourcePreviewProps {
  canOpenPainter: boolean;
  hasPaintedMask: boolean;
  onOpenPainter: () => void;
}

function ImageMaskSlot({
  canOpenPainter,
  hasPaintedMask,
  imageUrl,
  isConnected,
  onOpenPainter,
}: ImageMaskSlotProps) {
  return (
    <div className="relative rounded-lg border border-gray-700/60 bg-[#111217]/35 p-2 pl-5">
      <Handle
        id="image-mask"
        type="target"
        position={Position.Left}
        className={`nodrag nopan !left-0 !top-1/2 !-translate-x-1/2 !-translate-y-1/2 !w-6 !h-6 !border-[3px] !border-[#1e2027] ${isConnected ? '!bg-emerald-500' : '!bg-violet-500'}`}
      />
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">
        Mask Image
      </div>
      <ImagePreviewPane
        alt="Connected image edit mask"
        fallbackAspectRatio="1:1"
        imageMaxHeightClassName="max-h-24"
        minHeightClassName="min-h-[5.5rem]"
        placeholder={(
          <div className="px-4 text-center text-[10px] text-gray-500">
            {isConnected
              ? 'A mask source is wired. White/opaque regions are submitted as the editable selection.'
              : hasPaintedMask
                ? 'Node-painted mask saved. White/opaque regions are submitted as the editable selection.'
                : 'Connect a black-and-white mask or paint one from the source image.'}
          </div>
        )}
        src={imageUrl}
      />
      <button
        className={`${actionButtonClassName} mt-2 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50`}
        disabled={!canOpenPainter}
        onClick={onOpenPainter}
        type="button"
      >
        <Maximize2 size={12} />
        Paint mask
      </button>
      {isConnected && hasPaintedMask ? (
        <div className="mt-1 text-[9px] leading-3 text-gray-500">
          Connected mask overrides the saved painted mask.
        </div>
      ) : null}
    </div>
  );
}

interface ImageReferenceSlotProps {
  handleId: (typeof IMAGE_REFERENCE_HANDLES)[number];
  imageUrl?: string;
  isConnected: boolean;
  label: string;
}

function ImageReferenceSlot({ handleId, imageUrl, isConnected, label }: ImageReferenceSlotProps) {
  return (
    <div className="relative rounded-lg border border-gray-700/60 bg-[#111217]/35 p-2 pl-5">
      <Handle
        id={handleId}
        type="target"
        position={Position.Left}
        className={`nodrag nopan !left-0 !top-1/2 !-translate-x-1/2 !-translate-y-1/2 !w-6 !h-6 !border-[3px] !border-[#1e2027] ${isConnected ? '!bg-emerald-500' : '!bg-blue-500'}`}
      />
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">{label}</div>
      <ImagePreviewPane
        alt={label}
        fallbackAspectRatio="1:1"
        imageMaxHeightClassName="max-h-24"
        minHeightClassName="min-h-[5.5rem]"
        placeholder={<div className="px-2 text-center text-[9px] text-gray-500">Connect reference image</div>}
        src={imageUrl}
      />
    </div>
  );
}
