import type { Edge } from '@xyflow/react';
import {
  COMPOSITION_AUDIO_HANDLES,
} from './compositionTracks';
import { isCompositionVideoConnection } from './compositionEdgeMigration';
import {
  DEFAULT_EXECUTION_CONFIG,
  getAudioOutputFormat,
  getImageOutputFormat,
  getNodeAspectRatio,
  getVideoResolution,
} from './providerCatalog';
import {
  isVideoExtensionHandle,
  isVideoImageConditioningHandle,
  normalizeGeminiVideoModelId,
} from './videoModelSupport';
import { resolveEffectiveSourceNode } from './virtualNodes';
import type {
  AppNode,
  AudioProvider,
  ExecutionConfig,
  FlowNodeType,
  ImageProvider,
  NodeData,
  RuntimeSettingsSnapshot,
  TextProvider,
  UsageTelemetry,
  VideoProvider,
  VideoResolution,
  VideoTargetHandle,
} from '../types/flow';

interface TokenUsageEstimate {
  inputTokens: number;
  outputTokens: number;
}

interface TokenPricing {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

interface ExecutionContextEstimate {
  prompt: string;
  config: ExecutionConfig;
  audioSourceInput?: string;
  sourceVideoInput?: string;
  extensionVideoInput?: string;
}

export interface UsageRollup {
  totalKnownCostUsd: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  characters: number;
  durationSeconds: number;
  imageCount: number;
  knownCostCount: number;
  unknownCostCount: number;
}

export interface ExecutionPlanEstimate {
  nodeIds: string[];
  telemetries: Array<{ nodeId: string; telemetry: UsageTelemetry }>;
  rollup: UsageRollup;
}

const GEMINI_TEXT_PRICING: Array<{ match: (modelId: string) => boolean; pricing: TokenPricing }> = [
  {
    match: (modelId) => modelId.startsWith('gemini-3.1-pro-preview'),
    pricing: { inputUsdPerMillion: 2, outputUsdPerMillion: 12 },
  },
  {
    match: (modelId) => modelId.startsWith('gemini-3.1-flash-lite-preview'),
    pricing: { inputUsdPerMillion: 0.25, outputUsdPerMillion: 1.5 },
  },
  {
    match: (modelId) => modelId.startsWith('gemini-3-flash-preview'),
    pricing: { inputUsdPerMillion: 0.5, outputUsdPerMillion: 3 },
  },
  {
    match: (modelId) => modelId.startsWith('gemini-2.5-flash-lite'),
    pricing: { inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.4 },
  },
  {
    match: (modelId) => modelId.startsWith('gemini-2.5-flash'),
    pricing: { inputUsdPerMillion: 0.3, outputUsdPerMillion: 2.5 },
  },
];

const OPENAI_TEXT_PRICING: Array<{ match: (modelId: string) => boolean; pricing: TokenPricing }> = [
  {
    match: (modelId) => modelId === 'gpt-5.4',
    pricing: { inputUsdPerMillion: 2.5, outputUsdPerMillion: 15 },
  },
  {
    match: (modelId) => modelId === 'gpt-5.4-mini',
    pricing: { inputUsdPerMillion: 0.75, outputUsdPerMillion: 4.5 },
  },
  {
    match: (modelId) => modelId === 'gpt-5.4-nano',
    pricing: { inputUsdPerMillion: 0.2, outputUsdPerMillion: 1.25 },
  },
];

const GEMINI_VIDEO_PRICING: Array<{ match: (modelId: string) => boolean; usdPerSecond: number }> = [
  {
    match: (modelId) => modelId.includes('veo-3.1-fast'),
    usdPerSecond: 0.15,
  },
  {
    match: (modelId) => modelId.includes('veo-3.1'),
    usdPerSecond: 0.4,
  },
];

const ELEVENLABS_CHARACTER_PRICING: Array<{ match: (modelId: string) => boolean; usdPerThousandChars: number }> = [
  {
    match: (modelId) => modelId === 'eleven_v3' || modelId === 'eleven_multilingual_v2',
    usdPerThousandChars: 0.1,
  },
  {
    match: (modelId) =>
      modelId === 'eleven_flash_v2_5' || modelId === 'eleven_flash_v2' || modelId === 'eleven_turbo_v2_5',
    usdPerThousandChars: 0.05,
  },
];
function getGeminiTextPricing(modelId: string): TokenPricing | undefined {
  const normalized = modelId.trim().toLowerCase();
  return GEMINI_TEXT_PRICING.find((entry) => entry.match(normalized))?.pricing;
}

function getOpenAITextPricing(modelId: string): TokenPricing | undefined {
  const normalized = modelId.trim().toLowerCase();
  return OPENAI_TEXT_PRICING.find((entry) => entry.match(normalized))?.pricing;
}

function getGeminiVideoRate(modelId: string): number | undefined {
  const normalized = normalizeGeminiVideoModelId(modelId).trim().toLowerCase();
  return GEMINI_VIDEO_PRICING.find((entry) => entry.match(normalized))?.usdPerSecond;
}

function getElevenLabsCharacterRate(modelId: string): number | undefined {
  const normalized = modelId.trim().toLowerCase();
  return ELEVENLABS_CHARACTER_PRICING.find((entry) => entry.match(normalized))?.usdPerThousandChars;
}

function estimateTokensFromText(text: string): number {
  const normalized = text.trim();

  if (!normalized) {
    return 0;
  }

  return Math.max(1, Math.ceil(normalized.length / 4));
}

function estimateTextOutputTokens(inputTokens: number): number {
  if (inputTokens <= 0) {
    return 0;
  }

  return Math.max(128, Math.min(2048, Math.round(inputTokens * 1.25)));
}

function sumTextCost(pricing: TokenPricing, usage: TokenUsageEstimate): number {
  return (
    (usage.inputTokens * pricing.inputUsdPerMillion) / 1_000_000 +
    (usage.outputTokens * pricing.outputUsdPerMillion) / 1_000_000
  );
}

function formatCompactCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0';
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  }

  return String(Math.round(value));
}

export function formatUsd(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return 'Unknown';
  }

  if (value < 0.01) {
    return `$${value.toFixed(4)}`;
  }

  return `$${value.toFixed(2)}`;
}

export function estimateGeminiTextCostUsd(modelId: string, usage: TokenUsageEstimate): number | undefined {
  const pricing = getGeminiTextPricing(modelId);
  return pricing ? sumTextCost(pricing, usage) : undefined;
}

export function estimateOpenAITextCostUsd(modelId: string, usage: TokenUsageEstimate): number | undefined {
  const pricing = getOpenAITextPricing(modelId);
  return pricing ? sumTextCost(pricing, usage) : undefined;
}

function estimateGeminiImageCostUsd(
  modelId: string,
  inputTokens: number,
  aspectRatio: ExecutionConfig['aspectRatio'],
): number | undefined {
  const normalized = modelId.trim().toLowerCase();

  if (normalized.includes('flash-image')) {
    return (inputTokens * 0.3) / 1_000_000 + 0.039;
  }

  if (normalized.includes('image-preview')) {
    const outputCost = aspectRatio === '1:1' ? 0.067 : 0.101;
    return (inputTokens * 0.5) / 1_000_000 + outputCost;
  }

  return undefined;
}

export function estimateGeminiVideoCostUsd(
  modelId: string,
  durationSeconds: number,
  resolution: VideoResolution,
): number | undefined {
  void resolution;
  const rate = getGeminiVideoRate(modelId);

  if (rate === undefined) {
    return undefined;
  }

  return Math.max(0, durationSeconds) * rate;
}

export function estimateElevenLabsTtsCostUsd(modelId: string, characters: number): number | undefined {
  const rate = getElevenLabsCharacterRate(modelId);

  if (rate === undefined) {
    return undefined;
  }

  return (Math.max(0, characters) / 1_000) * rate;
}

function buildUsageTelemetry(
  source: UsageTelemetry['source'],
  confidence: UsageTelemetry['confidence'],
  details: Omit<UsageTelemetry, 'source' | 'confidence'>,
): UsageTelemetry {
  return {
    source,
    confidence,
    ...details,
  };
}

export function createMeasuredTextUsage(
  provider: TextProvider | 'unknown',
  modelId: string,
  usage: TokenUsageEstimate,
): UsageTelemetry {
  const pricing =
    provider === 'gemini'
      ? estimateGeminiTextCostUsd(modelId, usage)
      : provider === 'openai'
        ? estimateOpenAITextCostUsd(modelId, usage)
        : undefined;

  return buildUsageTelemetry('actual', 'measured', {
    provider,
    modelId,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.inputTokens + usage.outputTokens,
    costUsd: pricing,
    notes: pricing === undefined ? ['Pricing for this text model is not currently mapped in the app.'] : undefined,
  });
}

export function createGeminiVideoUsage(
  modelId: string,
  durationSeconds: number,
  resolution: VideoResolution,
  source: UsageTelemetry['source'],
): UsageTelemetry {
  const costUsd = estimateGeminiVideoCostUsd(modelId, durationSeconds, resolution);

  return buildUsageTelemetry(source, costUsd === undefined ? 'unknown' : 'fixed', {
    provider: 'gemini',
    modelId,
    durationSeconds,
    costUsd,
    notes: costUsd === undefined ? ['Pricing for this Veo model is not currently mapped in the app.'] : undefined,
  });
}

export function createElevenLabsTtsUsage(
  modelId: string,
  text: string,
  source: UsageTelemetry['source'],
): UsageTelemetry {
  const characters = text.length;
  const costUsd = estimateElevenLabsTtsCostUsd(modelId, characters);

  return buildUsageTelemetry(source, costUsd === undefined ? 'unknown' : 'fixed', {
    provider: 'elevenlabs',
    modelId,
    characters,
    costUsd,
    notes: costUsd === undefined ? ['Pricing for this ElevenLabs model is not currently mapped in the app.'] : undefined,
  });
}

export function createGeminiImageUsage(
  modelId: string,
  promptText: string,
  aspectRatio: ExecutionConfig['aspectRatio'],
  source: UsageTelemetry['source'],
  inputTokenOverride?: number,
): UsageTelemetry {
  const inputTokens = inputTokenOverride ?? estimateTokensFromText(promptText);
  const costUsd = estimateGeminiImageCostUsd(modelId, inputTokens, aspectRatio);

  return buildUsageTelemetry(source, costUsd === undefined ? 'unknown' : source === 'actual' ? 'measured' : 'fixed', {
    provider: 'gemini',
    modelId,
    inputTokens,
    totalTokens: inputTokens,
    imageCount: 1,
    costUsd,
    notes: costUsd === undefined ? ['Pricing for this Gemini image model is not currently mapped in the app.'] : undefined,
  });
}

export function createLocalCompositionUsage(source: UsageTelemetry['source']): UsageTelemetry {
  return buildUsageTelemetry(source, 'fixed', {
    provider: 'local',
    modelId: 'ffmpeg-browser',
    costUsd: 0,
    notes: ['Browser-side FFmpeg composition does not call a paid model.'],
  });
}

export function createLocalFrameExtractionUsage(source: UsageTelemetry['source']): UsageTelemetry {
  return buildUsageTelemetry(source, 'fixed', {
    provider: 'local',
    modelId: 'browser-video-frame-extraction',
    costUsd: 0,
    imageCount: 1,
    notes: ['Video frame extraction runs locally in the browser and does not call a paid model.'],
  });
}

function resolveNodeOutputAsset(node: AppNode): string | undefined {
  if (
    (node.type === 'imageGen' || node.type === 'audioGen' || node.type === 'videoGen') &&
    (node.data.mediaMode ?? 'generate') === 'import'
  ) {
    return node.data.sourceAssetUrl;
  }

  return node.data.result;
}

function shouldReuseExistingNodeOutput(node: AppNode): boolean {
  if (!['imageGen', 'videoGen', 'audioGen', 'composition'].includes(node.type)) {
    return false;
  }

  return Boolean(resolveNodeOutputAsset(node));
}

function canRunNode(node: AppNode): boolean {
  if (node.type === 'settings' || node.type === 'sourceBin' || node.type === 'virtual') {
    return false;
  }

  if (node.type === 'textNode') {
    return (node.data.mode ?? 'prompt') === 'generate';
  }

  if (node.type === 'imageGen' || node.type === 'audioGen' || node.type === 'videoGen') {
    return (node.data.mediaMode ?? 'generate') === 'generate';
  }

  return true;
}

function getModelId<TCapability extends keyof RuntimeSettingsSnapshot['defaultModels']>(
  settings: RuntimeSettingsSnapshot,
  capability: TCapability,
  provider: keyof RuntimeSettingsSnapshot['defaultModels'][TCapability],
  override?: string,
): string {
  const defaults = settings.defaultModels[capability] as Record<string, string>;
  return normalizeOptionalString(override) ?? defaults[String(provider)] ?? '';
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function buildNodeMap(nodes: AppNode[]): Map<string, AppNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

function buildIncomingMap(edges: Edge[]): Map<string, string[]> {
  const incoming = new Map<string, string[]>();

  for (const edge of edges) {
    const existing = incoming.get(edge.target) ?? [];
    existing.push(edge.source);
    incoming.set(edge.target, existing);
  }

  return incoming;
}

function getExecutionDependencies(
  node: AppNode,
  edges: Edge[],
  nodesById: Map<string, AppNode>,
): string[] {
  const dependencies = new Set<string>();

  for (const edge of edges) {
    if (edge.target !== node.id) {
      continue;
    }

    const rawSourceNode = nodesById.get(edge.source);
    const sourceNode = rawSourceNode
      ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges)
      : undefined;

    if (!sourceNode) {
      continue;
    }

    if (sourceNode.type === 'settings') {
      dependencies.add(sourceNode.id);
      continue;
    }

    if (node.type === 'textNode') {
      if (sourceNode.type === 'textNode' || sourceNode.type === 'imageGen') {
        dependencies.add(sourceNode.id);
      }

      continue;
    }

    if (node.type === 'imageGen') {
      if (
        sourceNode.type === 'textNode' ||
        sourceNode.type === 'imageGen' ||
        sourceNode.type === 'videoGen' ||
        sourceNode.type === 'composition'
      ) {
        dependencies.add(sourceNode.id);
      }

      continue;
    }

    if (node.type === 'audioGen') {
      const audioMode = (node.data.audioGenerationMode as string | undefined) ?? 'speech';

      if (audioMode === 'voiceChange') {
        if (sourceNode.type === 'audioGen') {
          dependencies.add(sourceNode.id);
        }

        continue;
      }

      if (sourceNode.type === 'textNode') {
        dependencies.add(sourceNode.id);
      }

      continue;
    }

    if (node.type === 'videoGen') {
      if (sourceNode.type === 'textNode') {
        dependencies.add(sourceNode.id);
        continue;
      }

      if (
        sourceNode.type === 'imageGen' &&
        isVideoImageConditioningHandle(edge.targetHandle as VideoTargetHandle | undefined)
      ) {
        dependencies.add(sourceNode.id);
        continue;
      }

      if (
        (sourceNode.type === 'videoGen' || sourceNode.type === 'composition') &&
        isVideoExtensionHandle(edge.targetHandle as VideoTargetHandle | undefined)
      ) {
        dependencies.add(sourceNode.id);
      }

      continue;
    }

    if (node.type === 'composition') {
      if (
        (isCompositionVideoConnection(edge) && ['videoGen', 'composition'].includes(sourceNode.type)) ||
        (COMPOSITION_AUDIO_HANDLES.includes(edge.targetHandle as typeof COMPOSITION_AUDIO_HANDLES[number]) &&
          sourceNode.type === 'audioGen')
      ) {
        dependencies.add(sourceNode.id);
      }
    }
  }

  return [...dependencies];
}

function collectTextInputs(
  nodeId: string,
  nodesById: Map<string, AppNode>,
  incoming: Map<string, string[]>,
): string {
  const sourceIds = incoming.get(nodeId) ?? [];
  const prompts = sourceIds.flatMap((sourceId) =>
    collectTextInputsFromSource(sourceId, nodesById, incoming, new Set()),
  );

  return prompts.join('\n\n').trim();
}

function collectTextInputsFromSource(
  sourceId: string,
  nodesById: Map<string, AppNode>,
  incoming: Map<string, string[]>,
  visited: Set<string>,
): string[] {
  if (visited.has(sourceId)) {
    return [];
  }

  visited.add(sourceId);

  const node = nodesById.get(sourceId);
  if (!node) {
    return [];
  }

  if (node.type === 'settings') {
    return (incoming.get(sourceId) ?? []).flatMap((upstreamId) =>
      collectTextInputsFromSource(upstreamId, nodesById, incoming, visited),
    );
  }

  if (node.type === 'virtual') {
    return (incoming.get(sourceId) ?? []).flatMap((upstreamId) =>
      collectTextInputsFromSource(upstreamId, nodesById, incoming, visited),
    );
  }

  if (node.type === 'textNode') {
    const mode = node.data.mode ?? 'prompt';
    const value =
      mode === 'generate'
        ? (node.data.result ?? node.data.prompt)?.trim()
        : node.data.prompt?.trim();

    return value ? [value] : [];
  }

  return [];
}

function collectUpstreamVideoInput(
  nodeId: string,
  nodesById: Map<string, AppNode>,
  edges: Edge[],
): string | undefined {
  const matchingEdges = edges.filter((edge) => edge.target === nodeId);

  for (const edge of matchingEdges) {
    const rawSourceNode = nodesById.get(edge.source);
    const sourceNode = rawSourceNode
      ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges)
      : undefined;

    if (!sourceNode || !['videoGen', 'composition'].includes(sourceNode.type)) {
      continue;
    }

    const asset = resolveNodeOutputAsset(sourceNode);

    if (asset) {
      return asset;
    }
  }

  return undefined;
}

function collectUpstreamAudioInput(
  nodeId: string,
  nodesById: Map<string, AppNode>,
  edges: Edge[],
): string | undefined {
  const matchingEdges = edges.filter((edge) => edge.target === nodeId);

  for (const edge of matchingEdges) {
    const rawSourceNode = nodesById.get(edge.source);
    const sourceNode = rawSourceNode
      ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges)
      : undefined;

    if (sourceNode?.type !== 'audioGen') {
      continue;
    }

    const asset = resolveNodeOutputAsset(sourceNode);

    if (asset) {
      return asset;
    }
  }

  return undefined;
}

function collectVideoExtensionInput(
  nodeId: string,
  nodesById: Map<string, AppNode>,
  edges: Edge[],
): string | undefined {
  const edge = edges.find(
    (candidate) => candidate.target === nodeId && candidate.targetHandle === 'video-source-video',
  );

  if (!edge) {
    return undefined;
  }

  const rawSourceNode = nodesById.get(edge.source);
  const sourceNode = rawSourceNode
    ? resolveEffectiveSourceNode(rawSourceNode, nodesById, edges)
    : undefined;

  if (!sourceNode || !['videoGen', 'composition'].includes(sourceNode.type)) {
    return undefined;
  }

  return resolveNodeOutputAsset(sourceNode);
}

function collectExecutionConfig(
  nodeId: string,
  currentNode: AppNode,
  nodesById: Map<string, AppNode>,
  incoming: Map<string, string[]>,
): ExecutionConfig {
  const configNodes: NodeData[] = [];
  visitConfigNodes(nodeId, nodesById, incoming, new Set(), configNodes);
  const baseConfig = getDefaultExecutionConfigForNode(currentNode.type);
  const mergedConfig = configNodes.reduce<ExecutionConfig>(
    (current, data) => mergeExecutionConfig(current, data),
    baseConfig,
  );

  return mergeExecutionConfig(mergedConfig, currentNode.data);
}

function visitConfigNodes(
  nodeId: string,
  nodesById: Map<string, AppNode>,
  incoming: Map<string, string[]>,
  visited: Set<string>,
  collected: NodeData[],
): void {
  if (visited.has(nodeId)) {
    return;
  }

  visited.add(nodeId);

  for (const sourceId of incoming.get(nodeId) ?? []) {
    visitConfigNodes(sourceId, nodesById, incoming, visited, collected);
    const sourceNode = nodesById.get(sourceId);

    if (sourceNode?.type === 'settings') {
      collected.push(sourceNode.data);
    }
  }
}

function mergeExecutionConfig(current: ExecutionConfig, data: NodeData): ExecutionConfig {
  return {
    aspectRatio: getNodeAspectRatio((data.aspectRatio as string | undefined) ?? current.aspectRatio),
    steps: coerceNumber(data.steps, current.steps),
    durationSeconds: coerceNumber(data.durationSeconds, current.durationSeconds),
    videoResolution: getVideoResolution((data.videoResolution as string | undefined) ?? current.videoResolution),
    imageOutputFormat: getImageOutputFormat(
      (data.imageOutputFormat as string | undefined) ?? current.imageOutputFormat,
    ),
    audioOutputFormat: getAudioOutputFormat(
      (data.audioOutputFormat as string | undefined) ?? current.audioOutputFormat,
    ),
  };
}

function coerceNumber(value: number | string | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function getDefaultExecutionConfigForNode(nodeType: FlowNodeType): ExecutionConfig {
  if (nodeType === 'videoGen') {
    return {
      ...DEFAULT_EXECUTION_CONFIG,
      aspectRatio: '16:9',
    };
  }

  return DEFAULT_EXECUTION_CONFIG;
}

function composePrompt(upstreamPrompt: string, nodePrompt: string): string {
  const contextPrompt = upstreamPrompt.trim();
  const instructionPrompt = nodePrompt.trim();

  if (contextPrompt && instructionPrompt) {
    return `Context:\n${contextPrompt}\n\nInstruction:\n${instructionPrompt}`;
  }

  return instructionPrompt || contextPrompt;
}

function estimateNodeOwnTelemetry(
  node: AppNode,
  context: ExecutionContextEstimate,
  settings: RuntimeSettingsSnapshot,
): UsageTelemetry | undefined {
  if (!canRunNode(node)) {
    return undefined;
  }

  if (node.type === 'textNode') {
    const provider = (node.data.provider as TextProvider | undefined) ?? 'gemini';
    const modelId = getModelId(settings, 'text', provider, node.data.modelId);
    const prompt = composePrompt(context.prompt, (node.data.prompt ?? '').trim());
    const systemPrompt = (node.data.systemPrompt ?? '').trim();
    const inputText = [systemPrompt, prompt].filter(Boolean).join('\n\n');
    const inputTokens = estimateTokensFromText(inputText);
    const outputTokens = estimateTextOutputTokens(inputTokens);

    if (!inputTokens) {
      return undefined;
    }

    const costUsd =
      provider === 'gemini'
        ? estimateGeminiTextCostUsd(modelId, { inputTokens, outputTokens })
        : provider === 'openai'
          ? estimateOpenAITextCostUsd(modelId, { inputTokens, outputTokens })
          : undefined;

    return buildUsageTelemetry('estimate', costUsd === undefined ? 'unknown' : 'heuristic', {
      provider,
      modelId,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      costUsd,
      notes: costUsd === undefined ? ['Pricing for this text model is not currently mapped in the app.'] : ['Output tokens are estimated heuristically before generation.'],
    });
  }

  if (node.type === 'imageGen') {
    if ((node.data.mediaMode ?? 'generate') !== 'generate') {
      return undefined;
    }

    if (context.sourceVideoInput) {
      return createLocalFrameExtractionUsage('estimate');
    }

    const provider = (node.data.provider as ImageProvider | undefined) ?? 'gemini';
    const modelId = getModelId(settings, 'image', provider, node.data.modelId);
    const prompt = context.prompt.trim();
    const inputTokens = estimateTokensFromText(prompt);

    if (!prompt) {
      return undefined;
    }

    if (provider === 'gemini') {
      return createGeminiImageUsage(modelId, prompt, context.config.aspectRatio, 'estimate', inputTokens);
    }

    return buildUsageTelemetry('estimate', 'unknown', {
      provider,
      modelId,
      inputTokens,
      totalTokens: inputTokens,
      imageCount: 1,
      notes: ['Pricing for this image provider is not currently mapped in the app.'],
    });
  }

  if (node.type === 'videoGen') {
    const provider = (node.data.provider as VideoProvider | undefined) ?? 'gemini';
    const modelId = getModelId(settings, 'video', provider, node.data.modelId);
    const prompt = context.prompt.trim();

    if (!prompt && !context.extensionVideoInput && !context.sourceVideoInput) {
      return undefined;
    }

    if (provider === 'gemini') {
      return createGeminiVideoUsage(modelId, context.config.durationSeconds, context.config.videoResolution, 'estimate');
    }

    return buildUsageTelemetry('estimate', 'unknown', {
      provider,
      modelId,
      durationSeconds: context.config.durationSeconds,
      notes: ['Pricing for this video provider is not currently mapped in the app.'],
    });
  }

  if (node.type === 'audioGen') {
    if ((node.data.mediaMode ?? 'generate') !== 'generate') {
      return undefined;
    }

    const provider = (node.data.provider as AudioProvider | undefined) ?? 'elevenlabs';
    const modelId = getModelId(settings, 'audio', provider, node.data.modelId);
    const audioMode = (node.data.audioGenerationMode as string | undefined) ?? 'speech';
    const prompt = context.prompt.trim();

    if (audioMode === 'voiceChange') {
      if (!context.audioSourceInput) {
        return undefined;
      }

      return buildUsageTelemetry('estimate', 'unknown', {
        provider,
        modelId,
        notes: ['Voice changer pricing is not currently mapped in the app.'],
      });
    }

    if (!prompt) {
      return undefined;
    }

    if (provider === 'elevenlabs' && audioMode === 'speech') {
      return createElevenLabsTtsUsage(modelId, prompt, 'estimate');
    }

    return buildUsageTelemetry('estimate', 'unknown', {
      provider,
      modelId,
      characters: prompt.length,
      notes: ['Pricing for this audio provider is not currently mapped in the app.'],
    });
  }

  if (node.type === 'composition') {
    return createLocalCompositionUsage('estimate');
  }

  return undefined;
}

export function aggregateUsageTelemetries(telemetries: UsageTelemetry[]): UsageRollup {
  return telemetries.reduce<UsageRollup>(
    (rollup, telemetry) => {
      rollup.totalKnownCostUsd += telemetry.costUsd ?? 0;
      rollup.inputTokens += telemetry.inputTokens ?? 0;
      rollup.outputTokens += telemetry.outputTokens ?? 0;
      rollup.totalTokens += telemetry.totalTokens ?? (telemetry.inputTokens ?? 0) + (telemetry.outputTokens ?? 0);
      rollup.characters += telemetry.characters ?? 0;
      rollup.durationSeconds += telemetry.durationSeconds ?? 0;
      rollup.imageCount += telemetry.imageCount ?? 0;

      if (telemetry.costUsd === undefined && telemetry.provider !== 'local') {
        rollup.unknownCostCount += 1;
      } else {
        rollup.knownCostCount += 1;
      }

      return rollup;
    },
    {
      totalKnownCostUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      characters: 0,
      durationSeconds: 0,
      imageCount: 0,
      knownCostCount: 0,
      unknownCostCount: 0,
    },
  );
}

export function estimateExecutionPlan(
  nodeId: string,
  nodes: AppNode[],
  edges: Edge[],
  settings: RuntimeSettingsSnapshot,
): ExecutionPlanEstimate {
  const nodesById = buildNodeMap(nodes);
  const incoming = buildIncomingMap(edges);
  const visited = new Set<string>();
  const order: string[] = [];

  const visit = (currentId: string) => {
    if (visited.has(currentId)) {
      return;
    }

    visited.add(currentId);
    const currentNode = nodesById.get(currentId);

    if (!currentNode) {
      return;
    }

    if (currentId !== nodeId && shouldReuseExistingNodeOutput(currentNode)) {
      return;
    }

    for (const dependencyId of getExecutionDependencies(currentNode, edges, nodesById)) {
      visit(dependencyId);
    }

    order.push(currentId);
  };

  visit(nodeId);

  const telemetries = order.flatMap((currentId) => {
    const currentNode = nodesById.get(currentId);

    if (!currentNode) {
      return [];
    }

    const telemetry = estimateNodeOwnTelemetry(
      currentNode,
      {
        prompt: collectTextInputs(currentId, nodesById, incoming),
        audioSourceInput: collectUpstreamAudioInput(currentId, nodesById, edges),
        sourceVideoInput: collectUpstreamVideoInput(currentId, nodesById, edges),
        extensionVideoInput: collectVideoExtensionInput(currentId, nodesById, edges),
        config: collectExecutionConfig(currentId, currentNode, nodesById, incoming),
      },
      settings,
    );

    return telemetry ? [{ nodeId: currentId, telemetry }] : [];
  });

  return {
    nodeIds: order,
    telemetries,
    rollup: aggregateUsageTelemetries(telemetries.map((entry) => entry.telemetry)),
  };
}

export function estimateCanvasRunCosts(
  nodes: AppNode[],
  edges: Edge[],
  settings: RuntimeSettingsSnapshot,
): UsageRollup {
  const nodesById = buildNodeMap(nodes);
  const incoming = buildIncomingMap(edges);
  const telemetries = nodes.flatMap((node) => {
    const telemetry = estimateNodeOwnTelemetry(
      node,
      {
        prompt: collectTextInputs(node.id, nodesById, incoming),
        audioSourceInput: collectUpstreamAudioInput(node.id, nodesById, edges),
        sourceVideoInput: collectUpstreamVideoInput(node.id, nodesById, edges),
        extensionVideoInput: collectVideoExtensionInput(node.id, nodesById, edges),
        config: collectExecutionConfig(node.id, node, nodesById, incoming),
      },
      settings,
    );

    return telemetry ? [telemetry] : [];
  });

  return aggregateUsageTelemetries(telemetries);
}

export function collectActualUsageRollup(nodes: AppNode[]): UsageRollup {
  const telemetries = nodes.flatMap((node) =>
    (node.data.resultHistory ?? []).flatMap((attempt) => (attempt.usage ? [attempt.usage] : [])),
  );

  return aggregateUsageTelemetries(telemetries);
}

export function formatUsageSummary(telemetry: UsageTelemetry | undefined, prefix?: string): string | undefined {
  if (!telemetry) {
    return undefined;
  }

  const parts: string[] = [];

  if (telemetry.inputTokens || telemetry.outputTokens) {
    const tokenParts: string[] = [];

    if (telemetry.inputTokens) {
      tokenParts.push(`${formatCompactCount(telemetry.inputTokens)} in`);
    }

    if (telemetry.outputTokens) {
      tokenParts.push(`${formatCompactCount(telemetry.outputTokens)} out`);
    }

    parts.push(tokenParts.join(' / '));
  }

  if (telemetry.characters) {
    parts.push(`${formatCompactCount(telemetry.characters)} chars`);
  }

  if (telemetry.durationSeconds) {
    parts.push(`${telemetry.durationSeconds}s video`);
  }

  if (telemetry.imageCount) {
    parts.push(`${telemetry.imageCount} image${telemetry.imageCount === 1 ? '' : 's'}`);
  }

  if (telemetry.costUsd !== undefined) {
    parts.push(formatUsd(telemetry.costUsd));
  } else {
    parts.push('pricing unknown');
  }

  return [prefix, parts.join(' · ')].filter(Boolean).join(': ');
}

export function formatRollupSummary(rollup: UsageRollup, prefix: string): string {
  const parts: string[] = [];

  if (rollup.totalKnownCostUsd > 0) {
    parts.push(formatUsd(rollup.totalKnownCostUsd));
  }

  if (rollup.inputTokens > 0 || rollup.outputTokens > 0) {
    parts.push(`${formatCompactCount(rollup.inputTokens)} in / ${formatCompactCount(rollup.outputTokens)} out`);
  }

  if (rollup.characters > 0) {
    parts.push(`${formatCompactCount(rollup.characters)} chars`);
  }

  if (rollup.durationSeconds > 0) {
    parts.push(`${rollup.durationSeconds}s video`);
  }

  if (rollup.imageCount > 0) {
    parts.push(`${rollup.imageCount} image${rollup.imageCount === 1 ? '' : 's'}`);
  }

  if (rollup.unknownCostCount > 0) {
    parts.push(`${rollup.unknownCostCount} unknown-rate model${rollup.unknownCostCount === 1 ? '' : 's'}`);
  }

  return `${prefix}: ${parts.join(' · ') || 'No billable model usage detected'}`;
}
