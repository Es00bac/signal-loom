import { memo, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Handle, Position } from '@xyflow/react';
import { Download, Image as ImageIcon, Upload } from 'lucide-react';
import { AttemptHistory } from './AttemptHistory';
import { BaseNode } from './BaseNode';
import { ExecutionTelemetryPanel } from './ExecutionTelemetryPanel';
import { ImageGenerationProgressBackdrop } from './ImageGenerationProgressBackdrop';
import { ImagePreviewPane } from './ImagePreviewPane';
import { MediaLoadingOverlay } from './MediaLoadingOverlay';
import { MediaPreviewModal } from './MediaPreviewModal';
import { saveImportedAsset } from '../../lib/assetStore';
import { buildDownloadFilename, downloadAsset } from '../../lib/downloadAsset';
import { EXPORT_BASENAME } from '../../lib/brand';
import { withFlowNodeInteractionClasses } from '../../lib/flowNodeInteraction';
import { getImageGenerationProgressDetail } from '../../lib/imageGenerationProgress';
import {
  hasConnectedImageEditSource,
  hasConnectedImageReferenceSource,
  resolveConnectedImageEditAsset,
  resolveConnectedImageReferenceAsset,
} from '../../lib/imageEditConnections';
import {
  supportsImageEditing,
  supportsImageReferenceGuidance,
} from '../../lib/imageModelSupport';
import { getCompatibleNodeActions } from '../../lib/nodeActionMenu';
import { hasConnectedVideoSource } from '../../lib/videoSourceConnections';
import {
  ASPECT_RATIO_OPTIONS,
  getConfiguredProviders,
  getModelOptions,
  getProviderLabel,
  IMAGE_STEP_OPTIONS,
} from '../../lib/providerCatalog';
import { useFlowStore } from '../../store/flowStore';
import { useCatalogStore } from '../../store/catalogStore';
import { useSettingsStore } from '../../store/settingsStore';
import type {
  AppNodeProps,
  AspectRatio,
  ImageProvider,
  MediaNodeMode,
  VideoFrameSelection,
} from '../../types/flow';

const selectClassName = withFlowNodeInteractionClasses(
  'w-full bg-[#111217]/50 text-gray-200 border border-gray-700/60 rounded-lg p-2 text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none shadow-inner',
);

const actionButtonClassName = withFlowNodeInteractionClasses(
  'inline-flex items-center gap-1 rounded-lg border border-gray-700/60 bg-[#111217]/40 px-2.5 py-1.5 text-[11px] font-semibold text-gray-200 transition-colors hover:border-gray-500 hover:text-white',
);

function ImageNodeComponent({ id, data }: AppNodeProps) {
  const apiKeys = useSettingsStore((state) => state.apiKeys);
  const providerSettings = useSettingsStore((state) => state.providerSettings);
  const defaultModels = useSettingsStore((state) => state.defaultModels.image);
  const modelCatalog = useCatalogStore((state) => state.modelCatalog);
  const mediaMode = (data.mediaMode ?? 'generate') as MediaNodeMode;
  const isCollapsed = Boolean(data.collapsed);
  const [isPreviewOpen, setPreviewOpen] = useState(false);
  const availableProviders = getConfiguredProviders('image', apiKeys, providerSettings);
  const provider = ((data.provider as ImageProvider | undefined) ?? availableProviders[0] ?? 'gemini') as ImageProvider;
  const selectedModelId = data.modelId ?? defaultModels[provider];
  const assetUrl = mediaMode === 'import' ? data.sourceAssetUrl : data.result;
  const assetMimeType = mediaMode === 'import' ? data.sourceAssetMimeType : 'image/png';
  const isImageGenerating = Boolean(data.isRunning);

  const connections = useFlowStore(
    useShallow((state) => ({
      hasVideoSourceConnection: hasConnectedVideoSource(state.nodes, state.edges, id),
      hasEditSourceConnection: hasConnectedImageEditSource(state.nodes, state.edges, id),
      editSourcePreviewUrl: resolveConnectedImageEditAsset(state.nodes, state.edges, id),
      hasReference1Connection: hasConnectedImageReferenceSource(state.nodes, state.edges, id, ['image-reference-1']),
      hasReference2Connection: hasConnectedImageReferenceSource(state.nodes, state.edges, id, ['image-reference-2']),
      hasReference3Connection: hasConnectedImageReferenceSource(state.nodes, state.edges, id, ['image-reference-3']),
      reference1PreviewUrl: resolveConnectedImageReferenceAsset(state.nodes, state.edges, id, ['image-reference-1']),
      reference2PreviewUrl: resolveConnectedImageReferenceAsset(state.nodes, state.edges, id, ['image-reference-2']),
      reference3PreviewUrl: resolveConnectedImageReferenceAsset(state.nodes, state.edges, id, ['image-reference-3']),
    })),
  );
  const {
    hasVideoSourceConnection,
    hasEditSourceConnection,
    editSourcePreviewUrl,
    hasReference1Connection,
    hasReference2Connection,
    hasReference3Connection,
    reference1PreviewUrl,
    reference2PreviewUrl,
    reference3PreviewUrl,
  } = connections;
  const hasReferenceConnections =
    hasReference1Connection || hasReference2Connection || hasReference3Connection;
  const canEditConnectedImage = supportsImageEditing(provider, selectedModelId);
  const canUseReferenceGuidance = supportsImageReferenceGuidance(provider, selectedModelId);
  const isVideoFrameMode = mediaMode === 'generate' && hasVideoSourceConnection;
  const isEditingMode = mediaMode === 'generate' && hasEditSourceConnection;
  const isReferenceGuidedMode = mediaMode === 'generate' && !isEditingMode && hasReferenceConnections;
  const selectedVideoFrame = (data.videoFrameSelection as VideoFrameSelection | undefined) ?? 'last';
  const configuredAspectRatio = (data.aspectRatio as AspectRatio | undefined) ?? '1:1';

  useEffect(() => {
    if (mediaMode !== 'generate' || availableProviders.length === 0 || availableProviders.includes(provider)) {
      return;
    }

    const nextProvider = availableProviders[0];
    data.onChange?.('provider', nextProvider);
    data.onChange?.('modelId', defaultModels[nextProvider]);
  }, [availableProviders, data, defaultModels, mediaMode, provider]);

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
      data.onChange?.('modelId', data.modelId ?? defaultModels[nextProvider]);
    }
  };

  const handleProviderChange = (nextProvider: ImageProvider) => {
    data.onChange?.('provider', nextProvider);
    data.onChange?.('modelId', defaultModels[nextProvider]);
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
                onChange={(event) => data.onChange?.('modelId', event.target.value)}
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
              Add an image-capable provider key in Settings to unlock generation models.
            </div>
          )}

          {!isVideoFrameMode ? (
            <div className="grid grid-cols-2 gap-2">
              <select
                className={selectClassName}
                onChange={(event) => data.onChange?.('aspectRatio', event.target.value)}
                value={data.aspectRatio ?? '1:1'}
              >
                {ASPECT_RATIO_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

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
            </div>
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
            Reference images are connected. Gemini will use them as style, outfit, asset, or composition guidance rather than treating them as the editable base image.
          </div>
        ) : (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-100">
            Reference-image guidance is currently wired for Gemini image models only. Switch this node to a Gemini image model to use connected references.
          </div>
        )
      ) : null}

      {mediaMode === 'generate' && !isVideoFrameMode && (canEditConnectedImage || canUseReferenceGuidance) ? (
        <>
          {canEditConnectedImage ? (
            <ImageEditSourceSlot imageUrl={editSourcePreviewUrl} isConnected={hasEditSourceConnection} />
          ) : null}
          {canUseReferenceGuidance ? (
            <div className="grid grid-cols-3 gap-2">
              <ImageReferenceSlot
                handleId="image-reference-1"
                imageUrl={reference1PreviewUrl}
                isConnected={hasReference1Connection}
                label="Reference 1"
              />
              <ImageReferenceSlot
                handleId="image-reference-2"
                imageUrl={reference2PreviewUrl}
                isConnected={hasReference2Connection}
                label="Reference 2"
              />
              <ImageReferenceSlot
                handleId="image-reference-3"
                imageUrl={reference3PreviewUrl}
                isConnected={hasReference3Connection}
                label="Reference 3"
              />
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
    </BaseNode>
  );
}

export const ImageNode = memo(ImageNodeComponent);

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

interface ImageReferenceSlotProps {
  handleId: 'image-reference-1' | 'image-reference-2' | 'image-reference-3';
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
