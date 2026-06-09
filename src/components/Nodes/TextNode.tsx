import { memo, useEffect, useMemo, useState } from 'react';
import { FileText, Image as ImageIcon, Music2, Type, Video, X } from 'lucide-react';
import { AttemptHistory } from './AttemptHistory';
import { BaseNode } from './BaseNode';
import { ExecutionTelemetryPanel } from './ExecutionTelemetryPanel';
import { getCompatibleNodeActions } from '../../lib/nodeActionMenu';
import {
  getConfiguredProviders,
  getModelOptions,
  getProviderLabel,
} from '../../lib/providerCatalog';
import {
  GEMINI_MEDIA_RESOLUTION_OPTIONS,
  GEMINI_THINKING_LEVEL_OPTIONS,
  TEXT_OUTPUT_FORMAT_OPTIONS,
  getDefaultGeminiTextMimeType,
  getGeminiTextMediaPrompt,
  isGeminiTextMediaInputSupported,
} from '../../lib/geminiTextModel';
import { useCatalogStore } from '../../store/catalogStore';
import { useFlowStore } from '../../store/flowStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useSourceBinStore } from '../../store/sourceBinStore';
import { useShallow } from 'zustand/react/shallow';
import { getGeneratedTextDisplay } from '../../lib/textNodeDisplay';
import { withFlowNodeInteractionClasses } from '../../lib/flowNodeInteraction';
import { assignVariableToResultAttempt } from '../../lib/flowVariables';
import { FlowVariableTextarea } from './FlowVariableTextarea';
import type {
  AppNodeProps,
  EditorSourceKind,
  GeminiMediaResolution,
  GeminiThinkingLevel,
  TextNodeMode,
  TextOutputFormat,
  TextProvider,
} from '../../types/flow';

const selectClassName = withFlowNodeInteractionClasses(
  'w-full bg-[#111217]/50 text-gray-200 border border-gray-700/60 rounded-lg p-2 text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none shadow-inner',
);

const promptTextAreaClassName = withFlowNodeInteractionClasses(
  'w-full bg-[#111217]/50 text-gray-200 border border-gray-700/60 rounded-lg p-2 pr-9 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none h-28 shadow-inner',
);

const instructionTextAreaClassName = withFlowNodeInteractionClasses(
  'w-full bg-[#111217]/50 text-gray-200 border border-gray-700/60 rounded-lg p-2 pr-9 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none h-20 shadow-inner',
);

const systemPromptTextAreaClassName = withFlowNodeInteractionClasses(
  'w-full bg-[#111217]/30 text-gray-300 border border-gray-800 rounded-lg p-2 pr-9 text-xs focus:ring-2 focus:ring-blue-500 outline-none resize-none h-16 shadow-inner',
);

const iconButtonClassName = withFlowNodeInteractionClasses(
  'rounded-md border border-gray-700/60 bg-[#111217]/60 p-1 text-gray-300 transition-colors hover:border-gray-500 hover:text-white',
);

function TextNodeComponent({ id, data }: AppNodeProps) {
  const apiKeys = useSettingsStore((state) => state.apiKeys);
  const providerSettings = useSettingsStore((state) => state.providerSettings);
  const defaultModels = useSettingsStore((state) => state.defaultModels.text);
  const modelCatalog = useCatalogStore((state) => state.modelCatalog);
  const sourceBinItems = useSourceBinStore(useShallow((state) => state.bins.flatMap((bin) => bin.items)));
  const mode = (data.mode ?? 'prompt') as TextNodeMode;
  const availableProviders = getConfiguredProviders('text', apiKeys, providerSettings);
  const provider = ((data.provider as TextProvider | undefined) ?? availableProviders[0] ?? 'gemini') as TextProvider;
  const isCollapsed = Boolean(data.collapsed);
  const generatedTextDisplay = getGeneratedTextDisplay(data.result);
  const [isMediaDropActive, setMediaDropActive] = useState(false);
  const directMediaItem = useMemo(
    () => sourceBinItems.find((item) => item.id === data.textVisionSourceItemId && isGeminiTextMediaInputSupported({
      kind: item.kind,
      mimeType: item.mimeType ?? getDefaultGeminiTextMimeType(item.kind),
    })),
    [data.textVisionSourceItemId, sourceBinItems],
  );
  const connectedMediaInputCount = useFlowStore((state) =>
    state.edges.reduce((count, edge) => {
      if (edge.target !== id) return count;
      const sourceNode = state.nodes.find((node) => node.id === edge.source);
      return sourceNode && ['imageGen', 'cropImageNode', 'audioGen', 'videoGen', 'composition'].includes(sourceNode.type)
        ? count + 1
        : count;
    }, 0),
  );

  useEffect(() => {
    if (mode !== 'generate' || availableProviders.length === 0 || availableProviders.includes(provider)) {
      return;
    }

    const nextProvider = availableProviders[0];
    data.onChange?.('provider', nextProvider);
    data.onChange?.('modelId', defaultModels[nextProvider]);
  }, [availableProviders, data, defaultModels, mode, provider]);

  const handleModeChange = (nextMode: TextNodeMode) => {
    data.onChange?.('mode', nextMode);

    if (nextMode === 'generate' && availableProviders.length > 0) {
      const nextProvider = availableProviders.includes(provider) ? provider : availableProviders[0];
      data.onChange?.('provider', nextProvider);
      data.onChange?.('modelId', data.modelId ?? defaultModels[nextProvider]);
    }
  };

  const handleProviderChange = (nextProvider: TextProvider) => {
    data.onChange?.('provider', nextProvider);
    data.onChange?.('modelId', defaultModels[nextProvider]);
  };

  const modelOptions = getModelOptions(
    'text',
    provider,
    modelCatalog,
    data.modelId ?? defaultModels[provider],
  );
  const assignAttemptVariable = (attemptId: string, variableName: string) => {
    data.onChange?.('resultHistory', assignVariableToResultAttempt(data.resultHistory, attemptId, variableName));
  };

  const handleMediaSourceDrop = (event: React.DragEvent<HTMLDivElement>) => {
    const rawPayload = event.dataTransfer.getData('application/x-flow-source-bin-item');

    if (!rawPayload) {
      return;
    }

    try {
      const { itemId } = JSON.parse(rawPayload) as { itemId?: string };
      const item = sourceBinItems.find((candidate) => candidate.id === itemId);

      if (!item || !item.assetUrl || !isGeminiTextMediaInputSupported({
        kind: item.kind,
        mimeType: item.mimeType ?? getDefaultGeminiTextMimeType(item.kind),
      })) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setMediaDropActive(false);

      if (mode === 'prompt') {
        handleModeChange('generate');
      }

      data.onChange?.('textVisionSourceItemId', item.id);

      if (!(data.prompt ?? '').trim()) {
        data.onChange?.('prompt', getGeminiTextMediaPrompt(item.kind));
      }
    } catch {
      setMediaDropActive(false);
    }
  };

  return (
    <BaseNode
      nodeId={id}
      icon={Type}
      nodeType="textNode"
      title={mode === 'prompt' ? 'Prompt Input' : 'Text Generation'}
      hasInput={mode === 'generate'}
      outputActions={getCompatibleNodeActions('textNode')}
      onRun={mode === 'generate' ? data.onRun : undefined}
      isRunning={data.isRunning}
      error={data.error}
      statusMessage={data.statusMessage}
      retryState={data.retryState}
      collapsedContent={
        mode === 'generate' ? (
          <GeneratedTextResultPanel compact text={generatedTextDisplay} />
        ) : undefined
      }
      containerClassName={mode === 'generate' && isCollapsed ? 'w-[300px]' : undefined}
      isCollapsed={mode === 'generate' ? isCollapsed : false}
      onToggleCollapsed={
        mode === 'generate'
          ? () => data.onChange?.('collapsed', !isCollapsed)
          : undefined
      }
    >
      {mode === 'generate' ? (
        <AttemptHistory
          attempts={data.resultHistory}
          onAssignVariable={assignAttemptVariable}
          onSelectAttempt={data.onSelectAttempt}
          selectedAttemptId={data.selectedResultId}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <ModeButton
          active={mode === 'prompt'}
          label="Prompt"
          onClick={() => handleModeChange('prompt')}
        />
        <ModeButton
          active={mode === 'generate'}
          label="Model"
          onClick={() => handleModeChange('generate')}
        />
      </div>

      {mode === 'prompt' ? (
        <FlowVariableTextarea
          placeholder="Enter the source prompt for downstream nodes..."
          className={promptTextAreaClassName}
          expandedTitle="Prompt Editor"
          onChange={(value) => data.onChange?.('prompt', value)}
          value={String(data.prompt ?? '')}
        />
      ) : (
        <>
          {availableProviders.length > 0 ? (
            <>
              <select
                className={selectClassName}
                onChange={(event) => handleProviderChange(event.target.value as TextProvider)}
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
                value={data.modelId ?? defaultModels[provider]}
              >
                {modelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>

              {provider === 'gemini' ? (
                <div className="grid grid-cols-2 gap-2">
                  <select
                    className={selectClassName}
                    onChange={(event) => data.onChange?.('geminiThinkingLevel', event.target.value as GeminiThinkingLevel)}
                    value={data.geminiThinkingLevel ?? 'default'}
                  >
                    {GEMINI_THINKING_LEVEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className={selectClassName}
                    onChange={(event) => data.onChange?.('geminiMediaResolution', event.target.value as GeminiMediaResolution)}
                    value={data.geminiMediaResolution ?? 'default'}
                  >
                    {GEMINI_MEDIA_RESOLUTION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className={selectClassName}
                    onChange={(event) => data.onChange?.('textOutputFormat', event.target.value as TextOutputFormat)}
                    value={data.textOutputFormat ?? 'plain'}
                  >
                    {TEXT_OUTPUT_FORMAT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <label className={withFlowNodeInteractionClasses('flex min-h-9 items-center gap-2 rounded-lg border border-gray-700/60 bg-[#111217]/40 px-2 text-[11px] font-semibold text-gray-300')}>
                    <input
                      checked={Boolean(data.geminiGoogleSearchEnabled)}
                      className="h-3.5 w-3.5 accent-blue-500"
                      onChange={(event) => data.onChange?.('geminiGoogleSearchEnabled', event.target.checked)}
                      type="checkbox"
                    />
                    Search
                  </label>
                  <label className={withFlowNodeInteractionClasses('col-span-2 flex min-h-9 items-center gap-2 rounded-lg border border-gray-700/60 bg-[#111217]/40 px-2 text-[11px] font-semibold text-gray-300')}>
                    <input
                      checked={Boolean(data.geminiCodeExecutionEnabled)}
                      className="h-3.5 w-3.5 accent-blue-500"
                      onChange={(event) => data.onChange?.('geminiCodeExecutionEnabled', event.target.checked)}
                      type="checkbox"
                    />
                    Code execution
                  </label>
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-100">
              Add a text-capable provider key in Settings to unlock model selection.
            </div>
          )}

          <FlowVariableTextarea
            placeholder="Instruction for the model..."
            className={instructionTextAreaClassName}
            expandedTitle="Instruction Editor"
            onChange={(value) => data.onChange?.('prompt', value)}
            value={String(data.prompt ?? '')}
          />

          <div
            className={withFlowNodeInteractionClasses(`rounded-lg border border-dashed px-2.5 py-2 text-[11px] transition-colors ${
              isMediaDropActive
                ? 'border-blue-400/70 bg-blue-500/12 text-blue-100'
                : 'border-gray-700/60 bg-[#111217]/25 text-gray-400'
            }`)}
            onDragEnter={(event) => {
              if (event.dataTransfer.types.includes('application/x-flow-source-bin-item')) {
                event.preventDefault();
                setMediaDropActive(true);
              }
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setMediaDropActive(false);
              }
            }}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes('application/x-flow-source-bin-item')) {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = 'copy';
              }
            }}
            onDrop={handleMediaSourceDrop}
          >
            <div className="flex items-center gap-2 text-gray-200">
              <MediaKindIcon kind={directMediaItem?.kind} />
              <span className="font-semibold">Media Context</span>
            </div>
            <div className="mt-1 text-[11px] leading-5 text-gray-400">
              Drop image, audio, video, PDF, or text-document sources for Gemini media analysis.
            </div>
            {directMediaItem ? (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-gray-700/60 bg-[#0f131b] p-2">
                {directMediaItem.kind === 'image' && directMediaItem.assetUrl ? (
                  <img
                    alt={directMediaItem.label}
                    className="h-10 w-14 rounded object-cover"
                    src={directMediaItem.assetUrl}
                  />
                ) : (
                  <div className="flex h-10 w-14 items-center justify-center rounded bg-[#0b0d13] text-blue-200">
                    <MediaKindIcon kind={directMediaItem.kind} size={14} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-semibold text-gray-100">{directMediaItem.label}</div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-gray-500">
                    Dropped {formatMediaKind(directMediaItem.kind)}
                  </div>
                </div>
                <button
                  className={iconButtonClassName}
                  onClick={() => data.onChange?.('textVisionSourceItemId', undefined)}
                  type="button"
                >
                  <X size={12} />
                </button>
              </div>
            ) : null}
            {connectedMediaInputCount > 0 ? (
              <div className="mt-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-2 text-[11px] text-emerald-100">
                {connectedMediaInputCount} connected media input{connectedMediaInputCount === 1 ? '' : 's'} will be included at run time.
              </div>
            ) : null}
          </div>

          <FlowVariableTextarea
            placeholder="Optional system prompt..."
            className={systemPromptTextAreaClassName}
            expandedTitle="System Prompt Editor"
            onChange={(value) => data.onChange?.('systemPrompt', value)}
            value={String(data.systemPrompt ?? '')}
          />

          <ExecutionTelemetryPanel nodeId={id} usage={data.usage} />

          <GeneratedTextResultPanel text={generatedTextDisplay} />
        </>
      )}
    </BaseNode>
  );
}

export const TextNode = memo(TextNodeComponent);

function MediaKindIcon({
  kind,
  size = 12,
}: {
  kind?: EditorSourceKind;
  size?: number;
}) {
  if (kind === 'audio') {
    return <Music2 size={size} />;
  }

  if (kind === 'video' || kind === 'composition') {
    return <Video size={size} />;
  }

  if (kind === 'document' || kind === 'subtitle' || kind === 'package') {
    return <FileText size={size} />;
  }

  return <ImageIcon size={size} />;
}

function formatMediaKind(kind: EditorSourceKind): string {
  switch (kind) {
    case 'composition':
      return 'video';
    case 'subtitle':
      return 'document';
    default:
      return kind;
  }
}

function GeneratedTextResultPanel({
  compact = false,
  text,
}: {
  compact?: boolean;
  text: string;
}) {
  return (
    <div
      className={withFlowNodeInteractionClasses(`rounded-lg border border-gray-700/60 bg-[#111217]/30 p-2 text-xs leading-5 text-gray-300 whitespace-pre-wrap ${
        compact
          ? 'max-h-36 min-h-24 overflow-y-auto overscroll-contain pr-2'
          : 'max-h-72 min-h-20 overflow-y-auto overscroll-contain pr-2'
      }`)}
    >
      {text}
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
