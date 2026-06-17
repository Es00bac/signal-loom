import type {
  AppNode,
  AspectRatio,
  DynamicValue,
  EditorAudioKeyframe,
  EditorStageObject,
  AudioProvider,
  ExecutionConfig,
  ImageProvider,
  ResultType,
  RuntimeSettingsSnapshot,
  TextProvider,
  UsageTelemetry,
  VideoExportPresetId,
  VideoRenderAssemblyManifestData,
  VideoReferenceType,
  VideoProvider,
} from '../types/flow';
import type { GenerateContentConfig, PartUnion } from '@google/genai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import {
  createElevenLabsTtsUsage,
  createGeminiImageUsage,
  createGeminiVideoUsage,
  createLocalImageCropUsage,
  createLocalCompositionUsage,
  createLocalFrameExtractionUsage,
  createMeasuredTextUsage,
} from './costEstimation';
import {
  supportsImageEditing,
  supportsImageReferenceGuidance,
  supportsTrueMaskInpaint,
} from './imageModelSupport';
import {
  estimateImageModelCostUsd,
  getImageModelDefinition,
  type ImageModelOperation,
} from './imageProviderCapabilities';
import { canDecodeImages, getDataUrlDimensions, normalizeMaskForProvider } from './imageMask/maskConventions';
import {
  buildBflFlux2Request,
  buildLocalOpenImageEditRequest,
  buildStabilityEditRequest,
  buildStabilityGenerationRequest,
  buildStabilityUpscaleRequest,
  type StabilityEditRequestInput,
} from './imageEditorAi/requestBuilders';
import { buildGeminiImagePrompt } from './geminiImagePrompt';
import { buildGeminiTtsPrompt } from './geminiTtsPrompt';
import { validateGeminiVideoRequest } from './geminiVideoValidation';
import { buildGeminiVideoRequest } from './geminiVideoRequest';
import {
  buildVertexOmniVideoRequestBody,
  buildVertexVeoVideoRequestBody,
} from './vertexVideoRequests';
import { loadProviderModule } from './dynamicImportRecovery';
import {
  composeMedia,
  composeSequenceMedia,
  describeSequenceRenderBackend,
  describeSequenceRenderBackendCaveat,
} from './mediaComposition';
import { getVideoExportPresetOption } from './videoPremiereParity';
import type { ManualEditorVisualSequenceClip } from './manualEditorSequence';
import type { TimelineAutomationPoint } from '../types/flow';
import {
  getSupportedImageAspectRatio,
  mapAspectRatioToImageDimensions,
  mapAspectRatioToImageSize,
} from './providerCatalog';
import { getSignalLoomNativeBridge } from './nativeApp';
import { getVertexProjectConfig } from './vertexProviderSettings';
import {
  buildVertexGeminiImageRequestBody,
  buildVertexImagenUpscaleRequestBody,
  dataUrlToVertexInlineImage,
  buildVertexImagenPredictRequestBody,
  getVertexImageRoute,
  isVertexImagenModelId,
  VERTEX_IMAGEN_UPSCALE_MODEL_ID,
  type VertexImageRoute,
} from './vertexImageRequests';
import {
  normalizeAndroidAcceleratorBaseUrl,
  runAndroidAcceleratorGenerate,
  runAndroidAcceleratorUpscale,
} from './androidAccelerator';
import { runAndroidNativeImageUpscale } from './androidNativeImageUpscaler';
import {
  runLocalCpuUpscaler,
  type LocalCpuUpscalerInput,
} from './localCpuUpscaler';
import {
  resolveUniversalConfiguredUpscalePlan,
  type UniversalConfiguredUpscalePlan,
} from './universalImageUpscale';
import { extractSelectedVideoFrame } from './videoFrameExtraction';
import {
  isGeminiOmniModelId,
  normalizeGeminiVideoModelId,
} from './videoModelSupport';
import {
  buildBackendProxyExecuteRequest,
  shouldUseBackendProxy,
} from './backendProxy';
import {
  buildGeminiTextConfig,
  buildGeminiTextInlinePart,
  getDefaultGeminiTextMimeType,
  isGeminiTextMediaInputSupported,
  type GeminiTextMediaInput,
} from './geminiTextModel';
import {
  createDefaultFunctionNodeConfig,
  executeFunctionNodeConfig,
} from './functionNodes';
import {
  cropImageDataUrl,
  resolveCropImageNodeSettings,
} from './cropImageNode';

export interface ExecutionContext {
  prompt: string;
  config: ExecutionConfig;
  textImageInputs?: string[];
  textMediaInputs?: GeminiTextMediaInput[];
  editImageInput?: string;
  refImageInput?: string;
  editMaskImageInput?: string;
  editReferenceImageInputs?: string[];
  audioSourceInput?: string;
  sourceVideoInput?: string;
  startImageInput?: string;
  endImageInput?: string;
  referenceImageInputs?: Array<{
    url: string;
    referenceType: VideoReferenceType;
  }>;
  extensionVideoInput?: string;
  videoInput?: string;
  audioInputs?: Array<{
    url: string;
    sourceNodeId: string;
    delayMs: number;
    volumePercent: number;
    enabled: boolean;
  }>;
  useVideoAudio?: boolean;
  videoAudioVolumePercent?: number;
  visualSequenceClips?: ManualEditorVisualSequenceClip[];
  stageObjects?: EditorStageObject[];
  sequenceAudioInputs?: Array<{
    url: string;
    sourceNodeId: string;
    sourceKind: 'audio' | 'video' | 'composition';
    mimeType?: string;
    offsetMs: number;
    trackIndex: number;
    trackVolumePercent?: number;
    volumePercent: number;
    volumeAutomationPoints?: TimelineAutomationPoint[];
    volumeKeyframes?: EditorAudioKeyframe[];
    enabled: boolean;
  }>;
  nativeAssemblyManifest?: VideoRenderAssemblyManifestData;
  functionInputs?: Record<string, DynamicValue>;
  exportPresetId?: VideoExportPresetId;
}

interface ExecutionResult {
  result: string;
  resultType: ResultType;
  statusMessage: string;
  blob?: Blob;
  usage?: UsageTelemetry;
  mimeType?: string;
  extension?: string;
  fileName?: string;
  outputMetadata?: Record<string, unknown>;
}

interface GeminiVideoOperation {
  name?: string;
  done?: boolean;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{
        video?: {
          uri?: string;
        };
      }>;
    };
  };
}

import { withExponentialBackoff } from './exponentialBackoff';
import { getProviderLimiter } from './providerRateLimiter';

export async function executeNodeRequest(
  node: AppNode,
  context: ExecutionContext,
  settings: RuntimeSettingsSnapshot,
  onStatus?: (statusMessage: string, retryState?: { attempt: number; max: number; nextAttemptAt: number }) => void,
  options: { signal?: AbortSignal } = {},
): Promise<ExecutionResult> {
  const providerId = typeof node.data.provider === 'string' ? node.data.provider : 'default';
  const limiter = getProviderLimiter(providerId);

  return withExponentialBackoff({
    maxRetries: settings.providerSettings.batchMaxRetries ?? 10,
    baseDelayMs: settings.providerSettings.batchRetryBaseDelayMs ?? 30000,
    abortSignal: options.signal,
    onRetry: (attempt, max, delay, error) => {
      const delaySec = Math.round(delay / 1000);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      onStatus?.(
        `API Error (${errorMsg}). Retrying ${attempt} of ${max}... Next attempt in ${delaySec}s`,
        { attempt, max, nextAttemptAt: Date.now() + delay }
      );
    },
    operation: () => limiter.acquire(async () => {
      throwIfAborted(options.signal);

      if (shouldProxyNodeExecution(node, settings)) {
        return executeNodeViaBackendProxy(node, context, settings, onStatus, options.signal);
      }

      switch (node.type) {
        case 'textNode':
          return executeTextNode(node, context, settings, onStatus);
        case 'imageGen':
          return executeImageNode(node, context, settings, onStatus);
        case 'cropImageNode':
          return executeCropImageNode(node, context, onStatus, options.signal);
        case 'videoGen':
          return executeVideoNode(node, context, settings, onStatus);
        case 'audioGen':
          return executeAudioNode(node, context, settings, onStatus);
        case 'composition':
          return executeCompositionNode(node, context, settings, onStatus);
        case 'visionVerifyNode':
          return executeVisionVerifyNode(node, context, settings, onStatus);
        case 'functionNode':
          return executeFunctionNode(node, context);
        case 'apiFetchNode':
          return executeApiFetchNode(node, context, onStatus);
        default:
          throw new Error(`Unsupported node type: ${node.type}`);
      }
    }),
  });
}

export async function hashExecutionParameters(nodeData: unknown, context: ExecutionContext): Promise<string> {
  const payload = JSON.stringify({ nodeData, context });
  const buffer = new TextEncoder().encode(payload);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function executeFunctionNode(
  node: AppNode,
  context: ExecutionContext,
): Promise<ExecutionResult> {
  const config = node.data.functionNode ?? createDefaultFunctionNodeConfig('Reusable function');
  const explicitFunctionInputs = context.functionInputs ?? {};
  const execution = executeFunctionNodeConfig(config, {
    ...explicitFunctionInputs,
    prompt: context.prompt,
    'input-flow': context.prompt,
    image: context.editImageInput ?? '',
    video: context.videoInput ?? context.sourceVideoInput ?? '',
    audio: context.audioSourceInput ?? '',
  });

  return {
    ...execution,
    usage: {
      source: 'actual',
      confidence: 'fixed',
      costUsd: 0,
      notes: ['Function nodes route existing graph outputs and local transforms without provider spend.'],
    },
  };
}

async function executeApiFetchNode(
  node: AppNode,
  context: ExecutionContext,
  onStatus?: (statusMessage: string) => void,
): Promise<ExecutionResult> {
  onStatus?.('Preparing API Web Request...');
  const url = String(context.prompt || node.data.url || '').trim();
  const method = String(node.data.method ?? 'GET').toUpperCase();
  const rawHeaders = String(node.data.headers ?? '').trim();
  const rawBody = String(node.data.body ?? '').trim();

  if (!url) {
    throw new Error('API Requester node needs a valid URL to run.');
  }

  // Parse custom headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (rawHeaders) {
    try {
      const lines = rawHeaders.split('\n');
      lines.forEach((line) => {
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1) {
          const name = line.substring(0, colonIndex).trim();
          const val = line.substring(colonIndex + 1).trim();
          if (name) headers[name] = val;
        }
      });
    } catch (err) {
      throw new Error(`Failed to parse custom headers: ${(err as Error).message}`);
    }
  }

  // Format body
  let body: BodyInit | null = null;
  if (method !== 'GET' && rawBody) {
    if (rawBody.startsWith('{') || rawBody.startsWith('[')) {
      try {
        JSON.parse(rawBody);
        body = rawBody;
      } catch {
        body = rawBody;
      }
    } else {
      body = rawBody;
    }
  }

  onStatus?.(`Sending ${method} request to ${url}...`);
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: method !== 'GET' ? body : undefined,
    });

    onStatus?.('Parsing API Response...');
    const text = await response.text();
    let result: unknown = text;
    let resultType: ResultType = 'text';

    if (response.headers.get('content-type')?.includes('application/json')) {
      try {
        result = JSON.parse(text);
        resultType = 'json';
      } catch {
        // Keep as string
      }
    }

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}: ${text}`);
    }

    return {
      result: typeof result === 'string' ? result : JSON.stringify(result),
      resultType,
      statusMessage: `Completed with status ${response.status}`,
    };
  } catch (err) {
    throw new Error(`Network request failed: ${(err as Error).message}`);
  }
}

function shouldProxyNodeExecution(node: AppNode, settings: RuntimeSettingsSnapshot): boolean {
  return shouldUseBackendProxy(settings.providerSettings) && (
    node.type === 'textNode' ||
    node.type === 'imageGen' ||
    node.type === 'videoGen' ||
    node.type === 'audioGen'
  );
}

async function executeNodeViaBackendProxy(
  node: AppNode,
  context: ExecutionContext,
  settings: RuntimeSettingsSnapshot,
  onStatus?: (statusMessage: string) => void,
  signal?: AbortSignal,
): Promise<ExecutionResult> {
  const proxyBaseUrl = settings.providerSettings.backendProxyBaseUrl.trim();
  const request = buildBackendProxyExecuteRequest({
    baseUrl: proxyBaseUrl,
    node,
    context,
    settings: {
      defaultModels: settings.defaultModels,
      providerSettings: settings.providerSettings,
    },
  });

  onStatus?.('Submitting provider run through backend proxy…');

  const response = await fetch(request.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request.body),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Backend proxy returned HTTP ${response.status}.`);
  }

  const payload = await response.json() as Partial<ExecutionResult> & { error?: string };

  if (payload.error) {
    throw new Error(payload.error);
  }

  if (typeof payload.result !== 'string' || typeof payload.resultType !== 'string') {
    throw new Error('Backend proxy returned an invalid execution payload.');
  }

  return {
    result: payload.result,
    resultType: payload.resultType as ResultType,
    statusMessage: payload.statusMessage ?? 'Generated through backend proxy',
    usage: payload.usage,
  };
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw new DOMException('The run was cancelled.', 'AbortError');
  }
}

async function executeVisionVerifyNode(
  node: AppNode,
  context: ExecutionContext,
  settings: RuntimeSettingsSnapshot,
  onStatus?: (statusMessage: string) => void,
): Promise<ExecutionResult> {
  const modelId = node.data.modelId ?? 'gemini-3.5-flash';

  onStatus?.(`Initializing multimodal verification with ${modelId}…`);

  const prompt = context.prompt || 'Verify consistency';
  const image = context.editImageInput;
  const refImage = context.refImageInput;

  if (!image) {
    throw new Error('Vision Verification requires an input image to analyze. Connect an image to verify.');
  }

  let verificationPrompt = '';
  const geminiParts: Array<{ text: string } | { inlineData: Awaited<ReturnType<typeof dataUrlToInlineImage>> }> = [];

  if (refImage) {
    verificationPrompt = [
      'You are a visual consistency and character verification agent.',
      'You are provided with two images:',
      '1. Subject Image (the generated panel or scene)',
      '2. Reference Image (the reference character design or item)',
      '',
      'Compare both images side-by-side.',
      'Verify if the character, item, or style shown in the Reference Image is consistent with and present inside the Subject Image.',
      'You must respond in exactly this format:',
      'Line 1: exactly the word "true" if consistent, or "false" if inconsistent',
      'Line 2: a brief one-sentence reason explaining why.',
      '',
      `ADDITIONAL GUIDANCE / TEXT DESCRIPTION:`,
      prompt,
    ].join('\n');

    geminiParts.push(
      { text: verificationPrompt },
      { inlineData: await dataUrlToInlineImage(image) },
      { inlineData: await dataUrlToInlineImage(refImage) }
    );
  } else {
    verificationPrompt = [
      'You are a visual consistency and verification agent.',
      'Compare the provided image with the description below.',
      'Determine if the image content and characters match the description.',
      'You must respond in exactly this format:',
      'Line 1: exactly the word "true" if consistent, or "false" if inconsistent',
      'Line 2: a brief one-sentence reason explaining why.',
      '',
      `TEXT DESCRIPTION:`,
      prompt,
    ].join('\n');

    geminiParts.push(
      { text: verificationPrompt },
      { inlineData: await dataUrlToInlineImage(image) }
    );
  }

  if (settings.providerSettings.geminiCredentialMode === 'vertex-adc') {
    const responseText = (await executeVertexGeminiTextContent({
      modelId,
      settings,
      body: buildVertexGeminiGenerateContentBody({
        parts: geminiParts,
        config: {},
      }),
      label: 'Vertex Gemini vision verification',
    })).trim() || 'false\nNo response received.';
    const lines = responseText.split('\n');
    const booleanResult = lines[0].toLowerCase().includes('true') ? 'true' : 'false';
    const explanation = lines.slice(1).join('\n').trim() || lines[0];

    return {
      result: booleanResult,
      resultType: 'text',
      statusMessage: `Verified: ${booleanResult.toUpperCase()}`,
      usage: {
        source: 'actual',
        confidence: 'measured',
        provider: 'gemini',
        modelId,
        notes: [explanation, 'Generated through Vertex AI desktop auth.'],
      },
    };
  }

  const apiKey = settings.apiKeys.gemini?.trim();
  if (!apiKey) {
    throw new Error('Gemini API key is required. Add it in settings.');
  }

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: modelId,
    contents: geminiParts,
  });

  const responseText = response.text?.trim() ?? 'false\nNo response received.';
  const lines = responseText.split('\n');
  const booleanResult = lines[0].toLowerCase().includes('true') ? 'true' : 'false';
  const explanation = lines.slice(1).join('\n').trim() || lines[0];

  return {
    result: booleanResult,
    resultType: 'text',
    statusMessage: `Verified: ${booleanResult.toUpperCase()}`,
    usage: {
      source: 'actual',
      confidence: 'measured',
      provider: 'gemini',
      modelId,
      inputTokens: response.usageMetadata?.promptTokenCount ?? 100,
      totalTokens: response.usageMetadata?.totalTokenCount ?? 100,
      notes: [explanation],
    },
  };
}

async function executeCropImageNode(
  node: AppNode,
  context: ExecutionContext,
  onStatus?: (statusMessage: string) => void,
  signal?: AbortSignal,
): Promise<ExecutionResult> {
  const sourceImageInput = context.editImageInput;
  if (!sourceImageInput) {
    throw new Error('Crop Image nodes need one connected image input.');
  }

  onStatus?.('Cropping image locally…');
  const cropResult = await cropImageDataUrl(
    sourceImageInput,
    resolveCropImageNodeSettings(node.data),
    { mimeType: 'image/png', signal },
  );

  return {
    result: cropResult.dataUrl,
    resultType: 'image',
    statusMessage: `Cropped image to ${cropResult.width}x${cropResult.height}`,
    usage: createLocalImageCropUsage('actual'),
    mimeType: cropResult.mimeType,
    extension: 'png',
    outputMetadata: {
      cropRect: cropResult.rect,
      height: cropResult.height,
      width: cropResult.width,
    },
  };
}

async function executeTextNode(
  node: AppNode,
  context: ExecutionContext,
  settings: RuntimeSettingsSnapshot,
  onStatus?: (statusMessage: string) => void,
): Promise<ExecutionResult> {
  const mode = node.data.mode ?? 'prompt';
  const promptText = (node.data.prompt ?? '').trim();

  if (mode === 'prompt') {
    if (!promptText) {
      throw new Error('Prompt nodes need text before they can feed the flow.');
    }

    return {
      result: promptText,
      resultType: 'text',
      statusMessage: 'Prompt ready',
    };
  }

  const provider = (node.data.provider as TextProvider | undefined) ?? 'gemini';
  const modelId = getModelId(settings, 'text', provider, node.data.modelId);
  const combinedPrompt = composePrompt(context.prompt, promptText);
  const textMediaInputs = normalizeTextMediaInputs(context);
  const textImageInputs = textMediaInputs.filter(isImageMediaInput).map((input) => input.url);
  const unsupportedTextMediaInputs = textMediaInputs.filter((input) => !isGeminiTextMediaInputSupported(input));
  const effectivePrompt = combinedPrompt || (textMediaInputs.length > 0 ? 'Analyze the connected media in detail.' : '');
  const systemPrompt = (node.data.systemPrompt ?? '').trim();

  if (!effectivePrompt) {
    throw new Error('Connect a prompt source or enter an instruction in this text node.');
  }

  switch (provider) {
    case 'gemini': {
      if (unsupportedTextMediaInputs.length > 0) {
        const labels = unsupportedTextMediaInputs
          .map((input) => input.label ?? input.mimeType ?? input.kind ?? 'media')
          .join(', ');
        throw new Error(`Gemini text analysis does not support this media input yet: ${labels}.`);
      }

      const mediaResolution = node.data.geminiMediaResolution;
      const mediaParts = await Promise.all(
        textMediaInputs.map(async (input) => {
          const inlineData = await dataUrlToInlineData(
            input.url,
            input.mimeType ?? getDefaultGeminiTextMimeType(input.kind) ?? 'application/octet-stream',
          );

          return buildGeminiTextInlinePart({
            data: inlineData.data,
            mimeType: inlineData.mimeType,
            mediaResolution,
          });
        }),
      );
      const geminiConfig = {
        ...buildGeminiTextConfig(node.data),
        systemInstruction: systemPrompt || undefined,
      } as GenerateContentConfig;
      const geminiContents = [
        ...mediaParts,
        { text: effectivePrompt },
      ] as unknown as PartUnion[];

      if (settings.providerSettings.geminiCredentialMode === 'vertex-adc') {
        onStatus?.(textMediaInputs.length > 0 ? 'Analyzing media with Vertex Gemini…' : 'Generating text with Vertex Gemini…');
        const result = await executeVertexGeminiTextContent({
          modelId,
          settings,
          body: buildVertexGeminiGenerateContentBody({
            parts: geminiContents as unknown[],
            config: buildGeminiTextConfig(node.data),
            systemPrompt,
          }),
          label: 'Vertex Gemini text',
        });

        return {
          result,
          resultType: 'text',
          statusMessage: `Generated with ${modelId}`,
        };
      }

      onStatus?.(textMediaInputs.length > 0 ? 'Analyzing media with Gemini…' : 'Generating text with Gemini…');
      const { GoogleGenAI } = await loadProviderModule(
        () => import('@google/genai'),
        'Google Gemini text',
      );
      const apiKey = requireApiKey(settings.apiKeys.gemini, 'Google Gemini');
      const client = new GoogleGenAI({
        apiKey,
        ...(mediaResolution && mediaResolution !== 'default' ? { apiVersion: 'v1alpha' } : {}),
      });
      const response = await client.models.generateContent({
        model: modelId,
        contents: geminiContents,
        config: geminiConfig,
      });
      const usage = response.usageMetadata;
      const result = extractGeminiTextResponse(response);

      if (!result) {
        throw new Error('Gemini returned an empty text response.');
      }

      return {
        result,
        resultType: 'text',
        statusMessage: `Generated with ${modelId}`,
        usage:
          usage
            ? createMeasuredTextUsage('gemini', modelId, {
                inputTokens: usage.promptTokenCount ?? 0,
                outputTokens: usage.candidatesTokenCount ?? 0,
              })
            : undefined,
      };
    }
    case 'openai': {
      const unsupportedOpenAIInputs = textMediaInputs.filter((input) => !isImageMediaInput(input));

      if (unsupportedOpenAIInputs.length > 0) {
        throw new Error('Audio, video, and document-to-text analysis are wired for Gemini text models in this app.');
      }

      onStatus?.(textImageInputs.length > 0 ? 'Analyzing image with OpenAI…' : 'Generating text with OpenAI…');
      const { default: OpenAI } = await loadProviderModule(
        () => import('openai'),
        'OpenAI text',
      );
      const apiKey = requireApiKey(settings.apiKeys.openai, 'OpenAI');
      const client = new OpenAI({
        apiKey,
        baseURL: normalizeOptionalString(settings.providerSettings.openaiBaseUrl),
        dangerouslyAllowBrowser: true,
      });
      const response = await client.chat.completions.create({
        model: modelId,
        messages: await buildOpenAITextMessages(systemPrompt, effectivePrompt, textImageInputs),
      });
      const message = response.choices[0]?.message?.content;
      const result = typeof message === 'string' ? message.trim() : '';

      if (!result) {
        throw new Error('OpenAI returned an empty text response.');
      }

      return {
        result,
        resultType: 'text',
        statusMessage: `Generated with ${modelId}`,
        usage:
          response.usage
            ? createMeasuredTextUsage('openai', modelId, {
                inputTokens: response.usage.prompt_tokens,
                outputTokens: response.usage.completion_tokens,
              })
            : undefined,
      };
    }
    case 'huggingface': {
      if (textMediaInputs.length > 0) {
        throw new Error('Media-to-text analysis is currently wired for Gemini and OpenAI text models in this app.');
      }

      onStatus?.('Generating text with Hugging Face…');
      const { HfInference } = await loadProviderModule(
        () => import('@huggingface/inference'),
        'Hugging Face text',
      );
      const apiKey = requireApiKey(settings.apiKeys.huggingface, 'Hugging Face');
      const client = new HfInference(apiKey);
      const response = await client.chatCompletion({
        model: modelId,
        messages: buildChatMessages(systemPrompt, effectivePrompt),
      });
      const content = response.choices?.[0]?.message?.content;
      const result = extractTextContent(content);

      if (!result) {
        throw new Error('Hugging Face returned an empty text response.');
      }

      return {
        result,
        resultType: 'text',
        statusMessage: `Generated with ${modelId}`,
      };
    }
  }
}

async function executeImageNode(
  node: AppNode,
  context: ExecutionContext,
  settings: RuntimeSettingsSnapshot,
  onStatus?: (statusMessage: string) => void,
): Promise<ExecutionResult> {
  const provider = (node.data.provider as ImageProvider | undefined) ?? 'gemini';
  const modelId = getModelId(settings, 'image', provider, node.data.modelId);
  const prompt = context.prompt.trim();
  const sourceImageInput = context.editImageInput;
  const maskImageInput = context.editMaskImageInput;
  const referenceImageInputs = context.editReferenceImageInputs ?? [];
  const sourceVideoInput = context.sourceVideoInput;
  const videoFrameSelection = ((node.data.videoFrameSelection as 'first' | 'last' | undefined) ?? 'last');
  const modelDefinition = getImageModelDefinition(provider, modelId);

  if (sourceVideoInput) {
    onStatus?.(`Extracting ${videoFrameSelection} video frame locally…`);
    const frameBlob = await extractSelectedVideoFrame(sourceVideoInput, videoFrameSelection);

    return {
      result: await toResultUrl(frameBlob),
      resultType: 'image',
      statusMessage: `Extracted ${videoFrameSelection} frame from upstream video`,
      usage: createLocalFrameExtractionUsage('actual'),
    };
  }

  if (!prompt) {
    throw new Error('Image nodes need an upstream text prompt. Connect text and optionally an image to edit.');
  }

  if (sourceImageInput && !supportsImageEditing(provider, modelId)) {
    throw new Error('The selected image model does not currently support upstream image editing in this app.');
  }

  if (maskImageInput && !supportsTrueMaskInpaint(provider, modelId)) {
    throw new Error('The selected image model does not accept an explicit mask input. Choose a mask-aware image edit model.');
  }

  if (referenceImageInputs.length > modelDefinition.capabilities.maxReferenceImages) {
    throw new Error(`${modelDefinition.label} supports at most ${modelDefinition.capabilities.maxReferenceImages} reference image${modelDefinition.capabilities.maxReferenceImages === 1 ? '' : 's'}.`);
  }

  if (referenceImageInputs.length > 0 && !supportsImageReferenceGuidance(provider, modelId)) {
    throw new Error('The selected image model does not accept reference-image guidance.');
  }

  const operationPrompt = buildImageOperationPrompt(prompt, node.data);

  switch (provider) {
    case 'gemini': {
      onStatus?.(
        sourceImageInput
          ? 'Editing image with Gemini…'
          : referenceImageInputs.length > 0
            ? 'Generating reference-guided image with Gemini…'
            : 'Generating image with Gemini…',
      );
      const geminiAspectRatio = getSupportedImageAspectRatio('gemini', modelId, context.config.aspectRatio);

      if (isVertexImagenModelId(modelId) && settings.providerSettings.geminiCredentialMode !== 'vertex-adc') {
        throw new Error('Imagen models require Vertex AI mode. Enable Vertex mode in Settings and set the Vertex project ID.');
      }

      if (settings.providerSettings.geminiCredentialMode === 'vertex-adc') {
        return executeVertexImageNode({
          modelId,
          prompt: operationPrompt,
          aspectRatio: geminiAspectRatio,
          sourceImageInput,
          referenceImageInputs,
          settings,
          onStatus,
        });
      }

      const { GoogleGenAI } = await loadProviderModule(
        () => import('@google/genai'),
        'Google Gemini image',
      );
      const apiKey = requireApiKey(settings.apiKeys.gemini, 'Google Gemini');
      const client = new GoogleGenAI({ apiKey });
      const geminiParts: Array<{ text: string } | { inlineData: Awaited<ReturnType<typeof dataUrlToInlineImage>> }> = [{
          text: buildGeminiImagePrompt(operationPrompt, {
            hasSourceImage: Boolean(sourceImageInput),
            referenceImageCount: referenceImageInputs.length,
          }),
      }];

      if (sourceImageInput) {
        geminiParts.push({
          inlineData: await dataUrlToInlineImage(sourceImageInput),
        });
      }

      for (const referenceInput of referenceImageInputs) {
        geminiParts.push({
          inlineData: await dataUrlToInlineImage(referenceInput),
        });
      }

      const response = await client.models.generateContent({
        model: modelId,
        contents: [{
          parts: geminiParts,
        }],
        config: {
          responseModalities: ['IMAGE'],
          imageConfig: {
            aspectRatio: geminiAspectRatio,
          },
        },
      });
      const imagePart = extractGeminiInlineData(response);

      if (!imagePart) {
        throw new Error('Gemini returned text only. Try a more explicit image-generation prompt.');
      }

      return applyConfiguredAutoUpscaleIfRequested({
        node,
        settings,
        context,
        result: {
        result: `data:${imagePart.mimeType};base64,${imagePart.data}`,
        resultType: 'image',
        statusMessage: `Generated with ${modelId}`,
        usage: createGeminiImageUsage(
          modelId,
          operationPrompt,
          geminiAspectRatio,
          'actual',
          response.usageMetadata?.promptTokenCount,
        ),
        },
        onStatus,
      });
    }
    case 'openai': {
      return executeOpenAiCompatibleImageNode({
        provider: 'openai',
        modelId,
        prompt: operationPrompt,
        sourceImageInput,
        maskImageInput,
        referenceImageInputs,
        context,
        node,
        settings,
        onStatus,
      });
    }
    case 'atlas': {
      if (isAtlasNativeImageModelId(modelId)) {
        return applyConfiguredAutoUpscaleIfRequested({
          node,
          settings,
          context,
          result: await executeAtlasNativeImageNode({
            modelId,
            prompt: operationPrompt,
            context,
            node,
            settings,
            sourceImageInput,
            maskImageInput,
            referenceImageInputs,
            onStatus,
          }),
          onStatus,
        });
      }

      return executeOpenAiCompatibleImageNode({
        provider: 'atlas',
        modelId,
        prompt: operationPrompt,
        sourceImageInput,
        maskImageInput,
        referenceImageInputs,
        context,
        node,
        settings,
        onStatus,
      });
    }
    case 'huggingface': {
      if (sourceImageInput || referenceImageInputs.length > 0) {
        throw new Error('Upstream image editing and reference-image guidance are currently supported for Gemini image models only, with OpenAI supporting single-source editing.');
      }

      onStatus?.('Generating image with Hugging Face…');
      const { HfInference } = await loadProviderModule(
        () => import('@huggingface/inference'),
        'Hugging Face image',
      );
      const apiKey = requireApiKey(settings.apiKeys.huggingface, 'Hugging Face');
      const client = new HfInference(apiKey);
      const { width, height } = mapAspectRatioToImageDimensions(context.config.aspectRatio);
      const blob = await client.textToImage({
        model: modelId,
        inputs: operationPrompt,
        parameters: {
          num_inference_steps: context.config.steps,
          width,
          height,
        },
      });

      return applyConfiguredAutoUpscaleIfRequested({
        node,
        settings,
        context,
        result: {
        result: await toResultUrl(blob),
        resultType: 'image',
        statusMessage: `Generated with ${modelId}`,
        },
        onStatus,
      });
    }
    case 'bfl':
      return applyConfiguredAutoUpscaleIfRequested({
        node,
        settings,
        context,
        result: await executeBflImageNode({
        modelId,
        prompt: operationPrompt,
        aspectRatio: getSupportedImageAspectRatio('bfl', modelId, context.config.aspectRatio),
        outputFormat: context.config.imageOutputFormat,
        seed: coerceOptionalNumber(node.data.imageSeed),
        sourceImageInput,
        referenceImageInputs,
        apiKey: requireApiKey(settings.apiKeys.bfl ?? '', 'Black Forest Labs'),
        onStatus,
        }),
        onStatus,
      });
    case 'stability':
      return applyConfiguredAutoUpscaleIfRequested({
        node,
        settings,
        context,
        result: await executeStabilityImageNode({
        modelId,
        prompt: operationPrompt,
        context,
        nodeData: node.data,
        sourceImageInput,
        maskImageInput,
        apiKey: requireApiKey(settings.apiKeys.stability ?? '', 'Stability AI'),
        onStatus,
        }),
        onStatus,
      });
    case 'localOpen':
      return applyConfiguredAutoUpscaleIfRequested({
        node,
        settings,
        context,
        result: await executeLocalOpenImageNode({
        modelId,
        prompt: operationPrompt,
        context,
        settings,
        sourceImageInput,
        maskImageInput,
        referenceImageInputs,
        onStatus,
        }),
        onStatus,
      });
    case 'android':
      return applyConfiguredAutoUpscaleIfRequested({
        node,
        settings,
        context,
        result: await executeAndroidAcceleratorImageNode({
          modelId,
          prompt: operationPrompt,
          context,
          settings,
          seed: coerceOptionalNumber(node.data.imageSeed),
          onStatus,
        }),
        onStatus,
      });
  }
}

interface BflCreateResponse {
  id?: string;
  polling_url?: string;
  cost?: number | null;
  error?: string | { message?: string };
}

interface BflPollResponse {
  status?: string;
  result?: {
    sample?: string;
  };
  error?: string | { message?: string };
}

interface AtlasCreateResponse {
  id?: string;
  prediction_id?: string;
  output?: string | string[];
  outputs?: string[];
  image?: string;
  images?: string[];
  result?: string | string[];
  error?: string | { message?: string };
  data?: {
    id?: string;
    prediction_id?: string;
    output?: string | string[];
    outputs?: string[];
    image?: string;
    images?: string[];
    result?: string | string[];
    error?: string | { message?: string };
  };
}

interface AtlasPollResponse extends AtlasCreateResponse {
  status?: string;
  data?: AtlasCreateResponse['data'] & {
    status?: string;
  };
}

interface AtlasUploadResponse {
  url?: string;
  download_url?: string;
  data?: {
    url?: string;
    download_url?: string;
  };
}

const ATLAS_NATIVE_IMAGE_MODEL_IDS = new Set([
  'black-forest-labs/flux-schnell',
  'black-forest-labs/flux-dev',
  'black-forest-labs/flux-dev-lora',
  'z-image/turbo',
  'bytedance/seedream-v5.0-lite',
  'google/nano-banana-pro/text-to-image',
  'black-forest-labs/flux-kontext-dev',
  'bytedance/seedream-v5.0-lite/edit',
  'atlascloud/qwen-image/edit',
  'atlascloud/qwen-image/edit-2511',
  'fireredteam/firered-image-edit-1.0',
]);

async function executeAtlasNativeImageNode(input: {
  modelId: string;
  prompt: string;
  context: ExecutionContext;
  node: AppNode;
  settings: RuntimeSettingsSnapshot;
  sourceImageInput?: string;
  maskImageInput?: string;
  referenceImageInputs: string[];
  onStatus?: (statusMessage: string) => void;
}): Promise<ExecutionResult> {
  const definition = getImageModelDefinition('atlas', input.modelId);
  const isEditOperation = Boolean(input.sourceImageInput || input.maskImageInput || input.referenceImageInputs.length > 0);

  if (!isEditOperation && !definition.capabilities.textToImage) {
    throw new Error(`${definition.label} needs a connected source image. Choose an Atlas text-to-image model for prompt-only generation.`);
  }

  const apiKey = requireApiKey(input.settings.apiKeys.atlas ?? '', 'Atlas');
  const baseUrl = normalizeAtlasBaseUrl(input.settings.providerSettings.atlasBaseUrl);
  const aspectRatio = getSupportedImageAspectRatio('atlas', input.modelId, input.context.config.aspectRatio);
  const { width, height } = mapAspectRatioToImageDimensions(aspectRatio);
  const sourceImage = input.sourceImageInput
    ? await uploadAtlasMedia(baseUrl, apiKey, input.sourceImageInput, 'flow-atlas-source.png')
    : undefined;
  const maskImage = input.maskImageInput && input.sourceImageInput
    ? await uploadAtlasMedia(
        baseUrl,
        apiKey,
        `data:image/png;base64,${await blobToBase64(await normalizeMaskBlob(input.maskImageInput, input.sourceImageInput, 'atlas', input.modelId))}`,
        'flow-atlas-mask.png',
      )
    : undefined;
  const referenceImages = await Promise.all(
    input.referenceImageInputs.map((imageInput, index) =>
      uploadAtlasMedia(baseUrl, apiKey, imageInput, `flow-atlas-reference-${index + 1}.png`)),
  );
  const seed = coerceOptionalNumber(input.node.data.imageSeed);
  const guidanceScale = coerceOptionalNumber(input.node.data.imageGuidanceScale);
  const editStrength = coerceOptionalNumber(input.node.data.imageEditStrength);
  const loraWeights = parseAtlasLoraWeights(input.node.data.imageLoraWeightsJson);
  const body: Record<string, unknown> = {
    model: input.modelId,
    prompt: input.prompt,
    width,
    height,
    steps: input.context.config.steps,
    output_format: input.context.config.imageOutputFormat,
    enable_safety_checker: input.node.data.imageSafetyCheckerEnabled ?? true,
  };

  if (seed !== undefined) {
    body.seed = seed;
  }
  if (guidanceScale !== undefined) {
    body.guidance_scale = guidanceScale;
  }
  if (editStrength !== undefined && isEditOperation) {
    body.strength = editStrength;
  }
  if (loraWeights !== undefined) {
    body.loras = loraWeights;
  }
  if (sourceImage) {
    body.image = sourceImage;
  }
  if (maskImage) {
    body.mask_image = maskImage;
  }
  if (referenceImages.length > 0) {
    body.reference_images = referenceImages;
  }

  input.onStatus?.(isEditOperation ? 'Editing image with Atlas Cloud...' : 'Generating image with Atlas Cloud...');
  const response = await fetch(`${baseUrl}/model/generateImage`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await extractErrorBody(response, 'Atlas image generation failed'));
  }

  const created = (await response.json()) as AtlasCreateResponse;
  if (created.error || created.data?.error) {
    throw new Error(extractProviderError(created.error ?? created.data?.error, 'Atlas image generation failed.'));
  }

  const immediateOutput = extractAtlasOutputUrl(created);
  const predictionId = extractAtlasPredictionId(created);
  const resultUrl = immediateOutput ?? (predictionId
    ? await pollAtlasPredictionResult(baseUrl, apiKey, predictionId, input.onStatus, 'image')
    : undefined);

  if (!resultUrl) {
    throw new Error('Atlas did not return a prediction ID or image output.');
  }

  const operation = resolveAtlasOperation(input.sourceImageInput, input.maskImageInput, referenceImages);
  const estimate = estimateImageModelCostUsd({
    providerId: 'atlas',
    modelId: input.modelId,
    operation,
    imageCount: 1,
  });

  const materializedResult = await materializeAtlasImageResult(
    normalizeAtlasResultUrl(resultUrl, input.context.config.imageOutputFormat),
  );

  return {
    result: materializedResult.result,
    resultType: 'image',
    mimeType: materializedResult.mimeType,
    statusMessage: `${isEditOperation ? 'Edited' : 'Generated'} with ${input.modelId}`,
    usage: buildImageUsage('atlas', input.modelId, {
      costUsd: estimate.costUsd,
      confidence: imageUsageConfidenceFromEstimate(estimate.confidence),
      notes: estimate.notes,
    }),
  };
}

function isAtlasNativeImageModelId(modelId: string): boolean {
  const normalizedModelId = modelId.trim().toLowerCase();
  return ATLAS_NATIVE_IMAGE_MODEL_IDS.has(normalizedModelId) ||
    (normalizedModelId.includes('/') && !normalizedModelId.startsWith('openai/'));
}

function normalizeAtlasBaseUrl(baseUrl: string | undefined): string {
  const trimmed = baseUrl?.trim().replace(/\/+$/, '');

  if (!trimmed) {
    return 'https://api.atlascloud.ai/api/v1';
  }

  if (trimmed === 'https://api.atlascloud.ai') {
    return 'https://api.atlascloud.ai/api/v1';
  }

  return trimmed;
}

async function uploadAtlasMedia(
  baseUrl: string,
  apiKey: string,
  imageInput: string,
  filename: string,
): Promise<string> {
  if (/^https?:\/\//i.test(imageInput)) {
    return imageInput;
  }

  const formData = new FormData();
  formData.append('file', await dataUrlToFile(imageInput, filename));
  const response = await fetch(`${baseUrl}/model/uploadMedia`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await extractErrorBody(response, 'Atlas media upload failed'));
  }

  const payload = (await response.json()) as AtlasUploadResponse;
  const uploadedUrl = payload.data?.download_url ?? payload.data?.url ?? payload.download_url ?? payload.url;

  if (!uploadedUrl) {
    throw new Error('Atlas media upload did not return a URL.');
  }

  return uploadedUrl;
}

async function pollAtlasPredictionResult(
  baseUrl: string,
  apiKey: string,
  predictionId: string,
  onStatus?: (statusMessage: string) => void,
  mediaLabel: 'image' | 'video' = 'image',
): Promise<string> {
  // Video jobs take longer than images, so allow a longer poll window.
  const maxAttempts = mediaLabel === 'video' ? 300 : 120;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(`${baseUrl}/model/prediction/${encodeURIComponent(predictionId)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(await extractErrorBody(response, `Atlas ${mediaLabel} polling failed`));
    }

    const payload = (await response.json()) as AtlasPollResponse;
    const outputUrl = extractAtlasOutputUrl(payload);
    const status = extractAtlasPredictionStatus(payload);

    if (status && isAtlasFailureStatus(status)) {
      throw new Error(extractProviderError(payload.error ?? payload.data?.error ?? status, `Atlas ${mediaLabel} generation failed.`));
    }

    if (outputUrl && (!status || isAtlasSuccessStatus(status))) {
      return outputUrl;
    }

    if (status && isAtlasSuccessStatus(status)) {
      throw new Error(`Atlas completed the ${mediaLabel} job without an output URL.`);
    }

    onStatus?.(`Atlas ${mediaLabel} is still in progress... ${attempt + 1} check${attempt === 0 ? '' : 's'} so far`);
    await sleep(2000);
  }

  throw new Error(`Atlas ${mediaLabel} generation timed out.`);
}

function extractAtlasPredictionId(payload: AtlasCreateResponse): string | undefined {
  return firstNonEmptyString(
    payload.data?.id,
    payload.data?.prediction_id,
    payload.id,
    payload.prediction_id,
  );
}

function extractAtlasPredictionStatus(payload: AtlasPollResponse): string | undefined {
  return firstNonEmptyString(payload.data?.status, payload.status)?.toLowerCase();
}

function extractAtlasOutputUrl(payload: AtlasCreateResponse): string | undefined {
  return firstNonEmptyString(
    firstStringFromUnknown(payload.data?.outputs),
    firstStringFromUnknown(payload.data?.output),
    firstStringFromUnknown(payload.data?.images),
    firstStringFromUnknown(payload.data?.image),
    firstStringFromUnknown(payload.data?.result),
    firstStringFromUnknown(payload.outputs),
    firstStringFromUnknown(payload.output),
    firstStringFromUnknown(payload.images),
    firstStringFromUnknown(payload.image),
    firstStringFromUnknown(payload.result),
  );
}

function firstStringFromUnknown(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value.trim() || undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const itemString = firstStringFromUnknown(item);
      if (itemString) {
        return itemString;
      }
    }
    return undefined;
  }

  // Atlas video predictions can nest the URL under an object, e.g.
  // `{ outputs: [url] }` or `{ url: ... }` — probe the common output keys.
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['outputs', 'output', 'url', 'video', 'videos', 'download_url']) {
      const nested = firstStringFromUnknown(record[key]);
      if (nested) {
        return nested;
      }
    }
  }

  return undefined;
}

function firstNonEmptyString(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value !== undefined && value.trim().length > 0);
}

function isAtlasSuccessStatus(status: string): boolean {
  return ['succeeded', 'success', 'completed', 'complete', 'done', 'ready'].includes(status.toLowerCase());
}

function isAtlasFailureStatus(status: string): boolean {
  return ['failed', 'failure', 'error', 'cancelled', 'canceled'].includes(status.toLowerCase());
}

function normalizeAtlasResultUrl(resultUrl: string, outputFormat: ExecutionConfig['imageOutputFormat']): string {
  if (/^(https?:|blob:|data:)/i.test(resultUrl)) {
    return resultUrl;
  }

  return `data:image/${outputFormat};base64,${resultUrl}`;
}

async function materializeAtlasImageResult(resultUrl: string): Promise<{ result: string; mimeType?: string }> {
  if (!/^https?:\/\//i.test(resultUrl)) {
    const inlineMimeType = resultUrl.match(/^data:([^;,]+)/)?.[1];
    return {
      result: resultUrl,
      mimeType: inlineMimeType,
    };
  }

  const blob = await fetchImageResultBlob(resultUrl, 'Atlas result download failed');
  return {
    result: await toResultUrl(blob),
    mimeType: blob.type || undefined,
  };
}

function parseAtlasLoraWeights(value: unknown): unknown {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

function resolveAtlasOperation(
  sourceImageInput: string | undefined,
  maskImageInput: string | undefined,
  referenceImages: string[],
): ImageModelOperation {
  if (maskImageInput) {
    return 'mask-inpaint';
  }

  if (sourceImageInput || referenceImages.length > 0) {
    return 'image-edit';
  }

  return 'text-to-image';
}

function imageUsageConfidenceFromEstimate(
  confidence: ReturnType<typeof estimateImageModelCostUsd>['confidence'],
): UsageTelemetry['confidence'] {
  switch (confidence) {
    case 'published-fixed':
      return 'fixed';
    case 'published-minimum':
    case 'token-estimate':
    case 'heuristic':
      return 'heuristic';
    case 'provider-defined':
    case 'unknown':
      return 'unknown';
  }
}

async function executeBflImageNode(input: {
  modelId: string;
  prompt: string;
  aspectRatio: AspectRatio;
  outputFormat: ExecutionConfig['imageOutputFormat'];
  seed?: number;
  sourceImageInput?: string;
  referenceImageInputs: string[];
  apiKey: string;
  onStatus?: (statusMessage: string) => void;
}): Promise<ExecutionResult> {
  input.onStatus?.(input.sourceImageInput ? 'Editing image with BFL FLUX.2…' : 'Generating image with BFL FLUX.2…');
  const sourceImage = input.sourceImageInput
    ? await normalizeRemoteImageInput(input.sourceImageInput)
    : undefined;
  const referenceImages = await Promise.all(
    input.referenceImageInputs.map((imageInput) => normalizeRemoteImageInput(imageInput)),
  );
  const built = buildBflFlux2Request({
    modelId: input.modelId,
    prompt: input.prompt,
    sourceImage,
    referenceImages,
    aspectRatio: input.aspectRatio,
    outputFormat: input.outputFormat,
    seed: input.seed,
    operation: input.sourceImageInput || input.referenceImageInputs.length > 0 ? 'image-edit' : 'text-to-image',
  });

  const response = await fetch(built.endpoint, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
      'x-key': input.apiKey,
    },
    body: JSON.stringify(built.body),
  });

  if (!response.ok) {
    throw new Error(await extractErrorBody(response, 'BFL image generation failed'));
  }

  const created = (await response.json()) as BflCreateResponse;
  if (created.error) {
    throw new Error(extractProviderError(created.error, 'BFL image generation failed.'));
  }
  if (!created.polling_url) {
    throw new Error('BFL did not return a polling URL.');
  }

  input.onStatus?.('Waiting for BFL image result…');
  const resultUrl = await pollBflImageResult(created.polling_url, input.apiKey, input.onStatus);
  const result = resultUrl.startsWith('data:')
    ? resultUrl
    : await toResultUrl(await fetchImageResultBlob(resultUrl, 'BFL result download failed'));
  const estimatedCost = created.cost !== null && created.cost !== undefined
    ? created.cost * 0.01
    : built.estimatedCostUsd;

  return {
    result,
    resultType: 'image',
    statusMessage: `Generated with ${input.modelId}`,
    usage: buildImageUsage('bfl', input.modelId, {
      costUsd: estimatedCost,
      confidence: estimatedCost === undefined ? 'unknown' : 'measured',
      notes: created.cost === undefined ? ['Published BFL estimate; actual cost may vary with megapixels.'] : undefined,
    }),
  };
}

async function applyConfiguredAutoUpscaleIfRequested(input: {
  node: AppNode;
  context: ExecutionContext;
  settings: RuntimeSettingsSnapshot;
  result: ExecutionResult;
  onStatus?: (statusMessage: string) => void;
}): Promise<ExecutionResult> {
  if (!input.node.data.imageAutoUpscale || input.result.resultType !== 'image') {
    return input.result;
  }

  const plan = resolveUniversalConfiguredUpscalePlan({
    providerSettings: input.settings.providerSettings,
    apiKeys: input.settings.apiKeys,
  });

  if (!plan.canRun) {
    throw new Error(plan.unavailableReason ?? 'The configured image upscaler is not available.');
  }

  input.onStatus?.(`Auto-upscaling with ${plan.label}...`);
  const upscaled = await runConfiguredFlowImageUpscale({
    sourceImage: input.result.result,
    outputFormat: input.context.config.imageOutputFormat,
    fallbackDimensions: mapAspectRatioToImageDimensions(input.context.config.aspectRatio),
    plan,
    prompt: input.context.prompt,
    settings: input.settings,
  });

  return {
    ...input.result,
    result: upscaled.result,
    mimeType: upscaled.mimeType ?? input.result.mimeType,
    statusMessage: `${input.result.statusMessage}; auto-upscaled with ${plan.label}`,
    usage: mergeImageUpscaleUsage(input.result.usage, plan),
  };
}

async function runConfiguredFlowImageUpscale(input: {
  sourceImage: string;
  outputFormat: ExecutionConfig['imageOutputFormat'];
  fallbackDimensions: { width: number; height: number };
  plan: UniversalConfiguredUpscalePlan;
  prompt: string;
  settings: RuntimeSettingsSnapshot;
}): Promise<{ result: string; mimeType?: string }> {
  if (input.plan.provider === 'android-accelerator') {
    const dimensions = await resolveImageDimensions(input.sourceImage).catch(() => input.fallbackDimensions);
    const sourceDataUrl = await normalizeRemoteImageInput(input.sourceImage);
    const result = await runAndroidAcceleratorUpscale({
      baseUrl: normalizeAndroidAcceleratorBaseUrl(input.settings.providerSettings.androidAcceleratorBaseUrl),
      authToken: input.settings.providerSettings.androidAcceleratorAuthToken,
      sourceDataUrl,
      targetWidthPx: dimensions.width * 2,
      targetHeightPx: dimensions.height * 2,
      upscalerId: input.settings.providerSettings.androidAcceleratorDefaultUpscaler ?? 'upscaler_realistic',
      outputFormat: input.outputFormat,
    });
    return {
      result: result.dataUrl,
      mimeType: result.mimeType,
    };
  }

  if (input.plan.provider === 'android-native') {
    const dimensions = await resolveImageDimensions(input.sourceImage).catch(() => input.fallbackDimensions);
    const sourceDataUrl = await normalizeRemoteImageInput(input.sourceImage);
    const result = await runAndroidNativeImageUpscale({
      sourceDataUrl,
      targetWidthPx: dimensions.width * 2,
      targetHeightPx: dimensions.height * 2,
      outputFormat: input.outputFormat,
    });
    return {
      result: result.dataUrl,
      mimeType: result.mimeType,
    };
  }

  if (input.plan.provider === 'local-ai-cpu') {
    const dimensions = await resolveImageDimensions(input.sourceImage).catch(() => input.fallbackDimensions);
    const sourceDataUrl = await normalizeRemoteImageInput(input.sourceImage);
    const result = await runLocalCpuUpscaler({
      baseUrl: input.settings.providerSettings.localAiCpuEndpointUrl ?? '',
      authHeader: input.settings.providerSettings.localAiCpuAuthHeader,
      sourceDataUrl,
      targetWidthPx: dimensions.width * 2,
      targetHeightPx: dimensions.height * 2,
      model: input.settings.providerSettings.localAiCpuModel,
      outputFormat: input.outputFormat,
    } as LocalCpuUpscalerInput);

    return {
      result: result.dataUrl,
      mimeType: result.mimeType,
    };
  }

  if (input.plan.provider === 'stability-fast' || input.plan.provider === 'stability-conservative') {
    const isConservative = input.plan.provider === 'stability-conservative';
    const apiKey = requireApiKey(input.settings.apiKeys.stability ?? '', 'Stability AI');
    const built = buildStabilityUpscaleRequest({
      mode: isConservative ? 'conservative' : 'fast',
      prompt: isConservative ? input.prompt : undefined,
      outputFormat: input.outputFormat,
    });
    const formData = formDataFromFields(built.fields);
    formData.append('image', await dataUrlToFile(input.sourceImage, 'flow-auto-upscale-source.png'));
    const response = await fetch(built.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'image/*',
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(await extractErrorBody(response, 'Configured Stability image upscale failed'));
    }

    const blob = await response.blob();
    return {
      result: await toResultUrl(blob),
      mimeType: blob.type || `image/${input.outputFormat}`,
    };
  }

  if (input.plan.provider === 'vertex-imagen') {
    const vertexConfig = getVertexProjectConfig(input.settings.providerSettings);
    const bridge = getSignalLoomNativeBridge();

    if (!vertexConfig.projectId || !bridge?.generateVertexImage) {
      throw new Error('Vertex Imagen upscaling requires the desktop Vertex bridge and a configured project.');
    }

    const result = await bridge.generateVertexImage({
      projectId: vertexConfig.projectId,
      location: vertexConfig.location,
      auth: vertexConfig.auth,
      modelId: VERTEX_IMAGEN_UPSCALE_MODEL_ID,
      route: 'imagen-predict',
      body: buildVertexImagenUpscaleRequestBody({
        image: dataUrlToVertexInlineImage(await normalizeRemoteImageInput(input.sourceImage)),
        outputMimeType: input.outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png',
        upscaleFactor: 'x2',
      }),
    });

    if (result.error) {
      throw new Error(result.error);
    }
    if (!result.result) {
      throw new Error('Vertex Imagen did not return an upscaled image payload.');
    }
    return {
      result: result.result,
      mimeType: result.mimeType,
    };
  }

  const dimensions = await resolveImageDimensions(input.sourceImage).catch(() => input.fallbackDimensions);
  return {
    result: await locallyScaleImageResult(input.sourceImage, dimensions.width * 2, dimensions.height * 2, input.outputFormat),
    mimeType: `image/${input.outputFormat}`,
  };
}

async function resolveImageDimensions(imageInput: string): Promise<{ width: number; height: number }> {
  const response = await fetch(imageInput);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  try {
    return {
      width: Math.max(1, bitmap.width),
      height: Math.max(1, bitmap.height),
    };
  } finally {
    bitmap.close();
  }
}

async function locallyScaleImageResult(
  imageInput: string,
  width: number,
  height: number,
  outputFormat: ExecutionConfig['imageOutputFormat'],
): Promise<string> {
  const response = await fetch(imageInput);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Local image upscale needs a 2D canvas context.');
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return toResultUrl(await canvas.convertToBlob({ type: `image/${outputFormat}` }));
  } finally {
    bitmap.close();
  }
}

function mergeImageUpscaleUsage(
  usage: UsageTelemetry | undefined,
  plan: UniversalConfiguredUpscalePlan,
): UsageTelemetry | undefined {
  if (!usage) {
    return plan.costUsd === undefined
      ? buildImageUsage(plan.provider, 'configured-upscaler', {
          confidence: 'unknown',
          notes: [`Auto-upscaled with ${plan.label}; cost is not mapped.`],
        })
      : buildImageUsage(plan.provider, 'configured-upscaler', {
          costUsd: plan.costUsd,
          confidence: 'fixed',
          notes: [`Auto-upscaled with ${plan.label}.`],
        });
  }

  const nextCost = usage.costUsd === undefined || plan.costUsd === undefined
    ? undefined
    : Math.round((usage.costUsd + plan.costUsd) * 10000) / 10000;

  return {
    ...usage,
    costUsd: nextCost,
    confidence: nextCost === undefined ? 'unknown' : usage.confidence,
    notes: [
      ...(usage.notes ?? []),
      `Auto-upscaled with ${plan.label}; upscale cost ${plan.costLabel}.`,
    ],
  };
}

async function pollBflImageResult(
  pollingUrl: string,
  apiKey: string,
  onStatus?: (statusMessage: string) => void,
): Promise<string> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await fetch(pollingUrl, {
      headers: {
        accept: 'application/json',
        'x-key': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(await extractErrorBody(response, 'BFL image polling failed'));
    }

    const payload = (await response.json()) as BflPollResponse;
    if (payload.status === 'Ready' && payload.result?.sample) {
      return payload.result.sample;
    }
    if (payload.status === 'Error' || payload.status === 'Failed' || payload.error) {
      throw new Error(extractProviderError(payload.error ?? payload.status, 'BFL image generation failed.'));
    }

    onStatus?.(`BFL image is still in progress… ${attempt + 1} check${attempt === 0 ? '' : 's'} so far`);
    await sleep(2000);
  }

  throw new Error('BFL image generation timed out after 240 seconds.');
}

async function executeStabilityImageNode(input: {
  modelId: string;
  prompt: string;
  context: ExecutionContext;
  nodeData: AppNode['data'];
  sourceImageInput?: string;
  maskImageInput?: string;
  apiKey: string;
  onStatus?: (statusMessage: string) => void;
}): Promise<ExecutionResult> {
  const operation = resolveStabilityOperation(input.modelId, input.nodeData.imageOperation, Boolean(input.sourceImageInput));
  const headers = {
    Authorization: `Bearer ${input.apiKey}`,
    Accept: 'image/*',
  };

  if (operation === 'text-to-image') {
    input.onStatus?.('Generating image with Stability AI…');
    const built = buildStabilityGenerationRequest({
      modelId: input.modelId,
      prompt: input.prompt,
      aspectRatio: getSupportedImageAspectRatio('stability', input.modelId, input.context.config.aspectRatio),
      outputFormat: input.context.config.imageOutputFormat,
    });
    const formData = formDataFromFields(built.fields);
    const response = await fetch(built.endpoint, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      throw new Error(await extractErrorBody(response, 'Stability AI image generation failed'));
    }

    return {
      result: await toResultUrl(await response.blob()),
      resultType: 'image',
      statusMessage: `Generated with ${input.modelId}`,
      usage: buildImageUsage('stability', input.modelId, {
        costUsd: built.estimatedCostUsd,
        confidence: built.estimatedCostUsd === undefined ? 'unknown' : 'fixed',
      }),
    };
  }

  if (operation === 'upscale') {
    if (!input.sourceImageInput) {
      throw new Error('This Stability AI upscale model needs a connected source image.');
    }

    input.onStatus?.('Upscaling image with Stability AI...');
    const isConservative = input.modelId === 'stable-image-upscale-conservative';
    const built = buildStabilityUpscaleRequest({
      mode: isConservative ? 'conservative' : 'fast',
      prompt: isConservative ? input.prompt : undefined,
      creativity: isConservative ? coerceOptionalNumber(input.nodeData.imageCreativity) : undefined,
      outputFormat: input.context.config.imageOutputFormat,
    });
    const formData = formDataFromFields(built.fields);
    formData.append('image', await dataUrlToFile(input.sourceImageInput, 'flow-stability-upscale-source.png'));
    const response = await fetch(built.endpoint, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      throw new Error(await extractErrorBody(response, 'Stability AI image upscale failed'));
    }

    return {
      result: await toResultUrl(await response.blob()),
      resultType: 'image',
      statusMessage: `Upscaled with ${input.modelId}`,
      usage: buildImageUsage('stability', input.modelId, {
        costUsd: built.estimatedCostUsd,
        confidence: built.estimatedCostUsd === undefined ? 'unknown' : 'fixed',
      }),
    };
  }

  if (!input.sourceImageInput) {
    throw new Error('This Stability AI edit model needs a connected source image.');
  }

  if ((operation === 'mask-inpaint' || operation === 'erase') && !input.maskImageInput) {
    throw new Error('This Stability AI edit model needs a connected mask image.');
  }

  const searchPrompt = normalizeOptionalString(input.nodeData.imageSearchPrompt as string | undefined);
  if ((operation === 'search-replace' || operation === 'search-recolor') && !searchPrompt) {
    throw new Error('This Stability AI edit model needs a search prompt describing what to find.');
  }

  input.onStatus?.('Editing image with Stability AI…');
  const built = buildStabilityEditRequest({
    operation,
    prompt: operation === 'remove-background' ? undefined : input.prompt,
    searchPrompt,
    outputFormat: input.context.config.imageOutputFormat,
    outpaint: operation === 'outpaint'
      ? {
          left: coerceOptionalNumber(input.nodeData.imageOutpaintLeft) ?? 0,
          right: coerceOptionalNumber(input.nodeData.imageOutpaintRight) ?? 0,
          up: coerceOptionalNumber(input.nodeData.imageOutpaintUp) ?? 0,
          down: coerceOptionalNumber(input.nodeData.imageOutpaintDown) ?? 0,
          creativity: coerceOptionalNumber(input.nodeData.imageCreativity),
        }
      : undefined,
  });
  const formData = formDataFromFields(built.fields);
  formData.append('image', await dataUrlToFile(input.sourceImageInput, 'flow-stability-source.png'));

  if (input.maskImageInput) {
    const maskBlob = await normalizeMaskBlob(input.maskImageInput, input.sourceImageInput, 'stability', input.modelId);
    formData.append('mask', new File([maskBlob], 'flow-stability-mask.png', { type: 'image/png' }));
  }

  const response = await fetch(built.endpoint, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await extractErrorBody(response, 'Stability AI image edit failed'));
  }

  return {
    result: await toResultUrl(await response.blob()),
    resultType: 'image',
    statusMessage: `Edited with ${input.modelId}`,
    usage: buildImageUsage('stability', input.modelId, {
      costUsd: built.estimatedCostUsd,
      confidence: built.estimatedCostUsd === undefined ? 'unknown' : 'fixed',
    }),
  };
}

async function executeLocalOpenImageNode(input: {
  modelId: string;
  prompt: string;
  context: ExecutionContext;
  settings: RuntimeSettingsSnapshot;
  sourceImageInput?: string;
  maskImageInput?: string;
  referenceImageInputs: string[];
  onStatus?: (statusMessage: string) => void;
}): Promise<ExecutionResult> {
  const endpoint = normalizeOptionalString(input.settings.providerSettings.localOpenImageEndpointUrl);
  if (!endpoint) {
    throw new Error('Local/Open image endpoint is missing. Add it in Settings before running this model.');
  }
  if (!input.sourceImageInput) {
    throw new Error('Local/Open image edit models need a connected source image.');
  }

  input.onStatus?.('Editing image with Local/Open endpoint…');
  const referenceImages = await Promise.all(
    input.referenceImageInputs.map((imageInput) => imageInputToBase64(imageInput)),
  );
  const body = buildLocalOpenImageEditRequest({
    model: input.modelId || input.settings.providerSettings.localOpenImageDefaultModel || 'Qwen/Qwen-Image-Edit',
    prompt: input.prompt,
    image: await imageInputToBase64(input.sourceImageInput),
    mask: input.maskImageInput
      ? await blobToBase64(await normalizeMaskBlob(input.maskImageInput, input.sourceImageInput, 'localOpen', input.modelId))
      : undefined,
    referenceImages,
    outputFormat: input.context.config.imageOutputFormat,
  });
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const auth = normalizeOptionalString(input.settings.providerSettings.localOpenImageAuthHeader);

  if (auth) {
    headers.Authorization = auth;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await extractErrorBody(response, 'Local/Open image edit failed'));
  }

  const contentType = response.headers.get('content-type') ?? '';
  const result = contentType.startsWith('image/')
    ? await toResultUrl(await response.blob())
    : await localOpenJsonResultToUrl(response);
  const estimate = estimateImageModelCostUsd({
    providerId: 'localOpen',
    modelId: input.modelId,
    operation: 'local-open-edit',
    imageCount: 1,
  });

  return {
    result,
    resultType: 'image',
    statusMessage: `Edited with ${body.model}`,
    usage: buildImageUsage('localOpen', body.model, {
      costUsd: estimate.costUsd,
      confidence: 'unknown',
      notes: estimate.notes,
    }),
  };
}

async function executeAndroidAcceleratorImageNode(input: {
  modelId: string;
  prompt: string;
  context: ExecutionContext;
  settings: RuntimeSettingsSnapshot;
  seed?: number;
  onStatus?: (statusMessage: string) => void;
}): Promise<ExecutionResult> {
  const baseUrl = normalizeAndroidAcceleratorBaseUrl(input.settings.providerSettings.androidAcceleratorBaseUrl);
  if (!baseUrl) {
    throw new Error('Android accelerator URL is missing. Pair the phone and paste its LAN URL in Settings.');
  }

  const dimensions = mapAspectRatioToImageDimensions(input.context.config.aspectRatio);
  input.onStatus?.('Generating image on Android accelerator...');
  const result = await runAndroidAcceleratorGenerate({
    baseUrl,
    authToken: input.settings.providerSettings.androidAcceleratorAuthToken,
    modelId: input.modelId || input.settings.providerSettings.androidAcceleratorDefaultImageModel || 'local-dream-active',
    prompt: input.prompt,
    width: dimensions.width,
    height: dimensions.height,
    steps: input.context.config.steps,
    seed: input.seed,
    outputFormat: input.context.config.imageOutputFormat,
  });

  return {
    result: result.dataUrl,
    resultType: 'image',
    statusMessage: `Generated on Android accelerator with ${result.modelUsed ?? input.modelId}`,
    mimeType: result.mimeType,
    usage: buildImageUsage('android', result.modelUsed ?? input.modelId, {
      costUsd: 0,
      confidence: 'fixed',
      notes: [`Generated on ${result.accelerator ?? 'Android accelerator'} with $0 provider spend.`],
    }),
  };
}

function buildImageOperationPrompt(prompt: string, data: AppNode['data']): string {
  const additions = [
    ['Exact color or palette', normalizeOptionalString(data.imageExactColor as string | undefined)],
    ['Text in image instruction', normalizeOptionalString(data.imageTextEditPrompt as string | undefined)],
  ].flatMap(([label, value]) => value ? [`${label}: ${value}`] : []);

  return additions.length > 0
    ? `${prompt}\n\n${additions.join('\n')}`
    : prompt;
}

function resolveStabilityOperation(
  modelId: string,
  override: unknown,
  hasSourceImage: boolean,
): StabilityEditRequestInput['operation'] | 'text-to-image' | 'upscale' {
  if (isStabilityOperation(override)) {
    return override;
  }

  const definition = getImageModelDefinition('stability', modelId);
  const operation = definition.supportedOperations[0];

  if (operation === 'upscale') {
    return 'upscale';
  }

  if (operation && operation !== 'image-edit' && operation !== 'local-open-edit') {
    return operation;
  }

  return hasSourceImage ? 'mask-inpaint' : 'text-to-image';
}

function isStabilityOperation(value: unknown): value is StabilityEditRequestInput['operation'] {
  if (value === 'upscale') {
    return false;
  }

  return value === 'mask-inpaint'
    || value === 'outpaint'
    || value === 'erase'
    || value === 'search-replace'
    || value === 'search-recolor'
    || value === 'remove-background'
    || value === 'replace-background-relight';
}

function formDataFromFields(fields: Record<string, string | number>): FormData {
  const formData = new FormData();

  Object.entries(fields).forEach(([key, value]) => {
    formData.append(key, String(value));
  });

  return formData;
}

async function normalizeRemoteImageInput(imageInput: string): Promise<string> {
  if (imageInput.startsWith('data:')) {
    return imageInput;
  }

  const inline = await dataUrlToInlineData(imageInput, 'image/png');
  return `data:${inline.mimeType};base64,${inline.data}`;
}

async function imageInputToBase64(imageInput: string): Promise<string> {
  return (await dataUrlToInlineData(imageInput, 'image/png')).data;
}

async function fetchImageResultBlob(url: string, fallback: string): Promise<Blob> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(await extractErrorBody(response, fallback));
  }

  return response.blob();
}

async function localOpenJsonResultToUrl(response: Response): Promise<string> {
  const payload = (await response.json()) as {
    image?: string;
    mimeType?: string;
    modelUsed?: string;
    error?: string;
  };

  if (payload.error) {
    throw new Error(payload.error);
  }
  if (!payload.image) {
    throw new Error('Local/Open image endpoint response did not include an image field.');
  }

  if (payload.image.startsWith('data:')) {
    return payload.image;
  }

  return toResultUrl(inlineDataToBlob(payload.image, payload.mimeType ?? 'image/png'));
}

function extractProviderError(error: string | { message?: string } | undefined, fallback: string): string {
  if (!error) {
    return fallback;
  }
  if (typeof error === 'string') {
    return error;
  }
  return error.message ?? fallback;
}

function buildImageUsage(
  provider: string,
  modelId: string,
  options: {
    costUsd?: number;
    confidence: UsageTelemetry['confidence'];
    notes?: string[];
  },
): UsageTelemetry {
  return {
    source: 'actual',
    confidence: options.confidence,
    provider,
    modelId,
    imageCount: 1,
    costUsd: options.costUsd,
    notes: options.notes,
  };
}

async function executeVertexImageNode(input: {
  modelId: string;
  prompt: string;
  aspectRatio: AspectRatio;
  sourceImageInput?: string;
  referenceImageInputs: string[];
  settings: RuntimeSettingsSnapshot;
  onStatus?: (statusMessage: string) => void;
}): Promise<ExecutionResult> {
  const vertexConfig = getVertexProjectConfig(input.settings.providerSettings);

  if (!vertexConfig.projectId) {
    throw new Error('Vertex AI project ID is missing. Add it in Settings before running Vertex image models.');
  }

  const bridge = getSignalLoomNativeBridge();

  if (!bridge?.generateVertexImage) {
    throw new Error('Vertex AI requires the Signal Loom desktop app with the native Vertex bridge.');
  }

  const route = getVertexImageRoute(input.modelId);
  const body = await buildVertexImageRequestBody({
    route,
    modelId: input.modelId,
    prompt: input.prompt,
    aspectRatio: input.aspectRatio,
    sourceImageInput: input.sourceImageInput,
    referenceImageInputs: input.referenceImageInputs,
  });

  input.onStatus?.(route === 'imagen-predict' ? 'Generating image with Vertex Imagen…' : 'Generating image with Vertex Gemini…');

  const result = await bridge.generateVertexImage({
    projectId: vertexConfig.projectId,
    location: vertexConfig.location,
    auth: vertexConfig.auth,
    modelId: input.modelId,
    route,
    body,
  });

  if (result.error) {
    throw new Error(result.error);
  }

  if (!result.result) {
    throw new Error('Vertex AI did not return an image payload.');
  }

  return {
    result: result.result,
    resultType: 'image',
    statusMessage: result.statusMessage ?? `Generated with ${input.modelId}`,
    mimeType: result.mimeType,
    usage: route === 'gemini-generate-content'
      ? createGeminiImageUsage(input.modelId, input.prompt, input.aspectRatio, 'actual')
      : undefined,
  };
}

async function buildVertexImageRequestBody(input: {
  route: VertexImageRoute;
  modelId: string;
  prompt: string;
  aspectRatio: AspectRatio;
  sourceImageInput?: string;
  referenceImageInputs: string[];
}): Promise<Record<string, unknown>> {
  if (input.route === 'imagen-predict') {
    if (input.sourceImageInput || input.referenceImageInputs.length > 0) {
      throw new Error('Imagen text-to-image models do not support upstream image editing or reference guidance in Flow yet.');
    }

    return buildVertexImagenPredictRequestBody({
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
    });
  }

  const sourceImage = input.sourceImageInput ? await dataUrlToInlineImage(input.sourceImageInput) : undefined;
  const referenceImages = await Promise.all(
    input.referenceImageInputs.map((referenceImageInput) => dataUrlToInlineImage(referenceImageInput)),
  );

  return buildVertexGeminiImageRequestBody({
    prompt: buildGeminiImagePrompt(input.prompt, {
      hasSourceImage: Boolean(input.sourceImageInput),
      referenceImageCount: input.referenceImageInputs.length,
    }),
    aspectRatio: input.aspectRatio,
    sourceImage,
    referenceImages,
  });
}

async function executeVertexGeminiTextContent(input: {
  modelId: string;
  settings: RuntimeSettingsSnapshot;
  body: Record<string, unknown>;
  label: string;
}): Promise<string> {
  const vertexConfig = getVertexProjectConfig(input.settings.providerSettings);

  if (!vertexConfig.projectId) {
    throw new Error(`${input.label} requires a configured Vertex AI project ID in Settings.`);
  }

  const bridge = getSignalLoomNativeBridge();

  if (!bridge?.generateVertexText) {
    throw new Error(`${input.label} requires the Signal Loom desktop app with the native Vertex text bridge.`);
  }

  const result = await bridge.generateVertexText({
    projectId: vertexConfig.projectId,
    location: vertexConfig.location,
    auth: vertexConfig.auth,
    modelId: input.modelId,
    body: input.body,
  });

  if (result.error) {
    throw new Error(result.error);
  }

  if (!result.text?.trim()) {
    throw new Error('Vertex AI returned no text content.');
  }

  return result.text.trim();
}

function buildVertexGeminiGenerateContentBody(input: {
  parts: unknown[];
  config: ReturnType<typeof buildGeminiTextConfig>;
  systemPrompt?: string;
}): Record<string, unknown> {
  const config = input.config as Record<string, unknown>;
  const tools = Array.isArray(config.tools) ? config.tools : undefined;
  const generationConfig = Object.fromEntries(
    Object.entries(config).filter(([key]) => key !== 'tools'),
  );

  return {
    contents: [
      {
        role: 'user',
        parts: input.parts,
      },
    ],
    ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
    ...(tools ? { tools } : {}),
    ...(input.systemPrompt?.trim()
      ? {
          systemInstruction: {
            parts: [{ text: input.systemPrompt.trim() }],
          },
        }
      : {}),
  };
}

async function executeVideoNode(
  node: AppNode,
  context: ExecutionContext,
  settings: RuntimeSettingsSnapshot,
  onStatus?: (statusMessage: string) => void,
): Promise<ExecutionResult> {
  const provider = (node.data.provider as VideoProvider | undefined) ?? 'gemini';
  const rawModelId = getModelId(settings, 'video', provider, node.data.modelId);
  const modelId = provider === 'gemini' ? normalizeGeminiVideoModelId(rawModelId) : rawModelId;
  const prompt = context.prompt.trim();

  if (!prompt && !context.startImageInput && !context.extensionVideoInput) {
    throw new Error('Video nodes need an upstream text prompt.');
  }

  switch (provider) {
    case 'gemini': {
      if (settings.providerSettings.geminiCredentialMode === 'vertex-adc') {
        return isGeminiOmniModelId(modelId)
          ? executeVertexOmniVideoNode({
              modelId,
              prompt,
              context,
              settings,
              onStatus,
            })
          : executeVertexVeoVideoNode({
              modelId,
              prompt,
              context,
              settings,
              seed: coerceOptionalNumber(node.data.videoSeed),
              negativePrompt: normalizeOptionalString(node.data.videoNegativePrompt as string | undefined),
              sampleCount: coerceOptionalNumber(node.data.videoBatchCount),
              onStatus,
            });
      }

      const apiKey = requireApiKey(settings.apiKeys.gemini, 'Google Gemini');

      if (isGeminiOmniModelId(modelId)) {
        return executeGeminiOmniVideoNode(apiKey, modelId, prompt, context, onStatus);
      }

      onStatus?.('Submitting video render to Gemini…');
      const operation = await startGeminiVideoGeneration(
        apiKey,
        modelId,
        prompt,
        context,
        coerceOptionalNumber(node.data.videoSeed),
        normalizeOptionalString(node.data.videoNegativePrompt as string | undefined),
        coerceOptionalNumber(node.data.videoBatchCount),
      );
      const videoBlob = await pollGeminiVideoResult(apiKey, operation, onStatus);

      return {
        result: await toResultUrl(videoBlob),
        resultType: 'video',
        statusMessage: `Generated ${context.config.durationSeconds}s ${context.config.videoResolution} video with ${modelId}`,
        usage: createGeminiVideoUsage(
          modelId,
          context.config.durationSeconds,
          context.config.videoResolution,
          'actual',
        ),
      };
    }
    case 'huggingface': {
      if (context.startImageInput || context.endImageInput) {
        throw new Error('Start and end frame inputs are currently wired for Gemini Veo only.');
      }

      const { HfInference } = await loadProviderModule(
        () => import('@huggingface/inference'),
        'Hugging Face video',
      );
      onStatus?.('Generating video with Hugging Face…');
      const apiKey = requireApiKey(settings.apiKeys.huggingface, 'Hugging Face');
      const client = new HfInference(apiKey);
      const blob = await client.textToVideo({
        model: modelId,
        inputs: prompt,
      });

      return {
        result: await toResultUrl(blob),
        resultType: 'video',
        statusMessage: `Generated with ${modelId}`,
      };
    }
    case 'atlas': {
      return executeAtlasVideoNode({ modelId, prompt, context, node, settings, onStatus });
    }
  }
}

async function executeAtlasVideoNode(input: {
  modelId: string;
  prompt: string;
  context: ExecutionContext;
  node: AppNode;
  settings: RuntimeSettingsSnapshot;
  onStatus?: (statusMessage: string) => void;
}): Promise<ExecutionResult> {
  const apiKey = requireApiKey(input.settings.apiKeys.atlas ?? '', 'Atlas');
  const baseUrl = normalizeAtlasBaseUrl(input.settings.providerSettings.atlasBaseUrl);
  // Image-to-video models take an uploaded start frame; text-to-video does not.
  const startImage = input.context.startImageInput
    ? await uploadAtlasMedia(baseUrl, apiKey, input.context.startImageInput, 'flow-atlas-video-start.png')
    : undefined;
  const body: Record<string, unknown> = {
    model: input.modelId,
    prompt: input.prompt,
    duration: input.context.config.durationSeconds,
    resolution: input.context.config.videoResolution,
    aspect_ratio: input.context.config.aspectRatio,
    generate_audio: input.node.data.videoGenerateAudio ?? true,
  };
  const seed = coerceOptionalNumber(input.node.data.videoSeed);
  if (seed !== undefined) body.seed = seed;
  const negativePrompt = normalizeOptionalString(input.node.data.videoNegativePrompt as string | undefined);
  if (negativePrompt) body.negative_prompt = negativePrompt;
  if (startImage) body.image = startImage;

  input.onStatus?.('Generating video with Atlas Cloud…');
  const response = await fetch(`${baseUrl}/model/generateVideo`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await extractErrorBody(response, 'Atlas video generation failed'));
  }

  const created = (await response.json()) as AtlasCreateResponse;
  if (created.error || created.data?.error) {
    throw new Error(extractProviderError(created.error ?? created.data?.error, 'Atlas video generation failed.'));
  }

  const immediateOutput = extractAtlasOutputUrl(created);
  const predictionId = extractAtlasPredictionId(created);
  const resultUrl = immediateOutput ?? (predictionId
    ? await pollAtlasPredictionResult(baseUrl, apiKey, predictionId, input.onStatus, 'video')
    : undefined);

  if (!resultUrl) {
    throw new Error('Atlas did not return a prediction ID or video output.');
  }

  const materialized = await materializeAtlasVideoResult(resultUrl);
  return {
    result: materialized.result,
    resultType: 'video',
    mimeType: materialized.mimeType,
    statusMessage: `Generated ${input.context.config.durationSeconds}s ${input.context.config.videoResolution} video with ${input.modelId}`,
  };
}

// Atlas video result files can sit on a CORS-restricted CDN; fetch+inline when
// possible, otherwise hand back the remote URL (a <video src> still plays it).
async function materializeAtlasVideoResult(resultUrl: string): Promise<{ result: string; mimeType?: string }> {
  if (!/^https?:\/\//i.test(resultUrl)) {
    return { result: resultUrl, mimeType: resultUrl.match(/^data:([^;,]+)/)?.[1] };
  }
  try {
    const blob = await fetchImageResultBlob(resultUrl, 'Atlas video download failed');
    return { result: await toResultUrl(blob), mimeType: blob.type || undefined };
  } catch {
    return { result: resultUrl, mimeType: 'video/mp4' };
  }
}

async function executeVertexVeoVideoNode(input: {
  modelId: string;
  prompt: string;
  context: ExecutionContext;
  settings: RuntimeSettingsSnapshot;
  seed?: number;
  negativePrompt?: string;
  sampleCount?: number;
  onStatus?: (statusMessage: string) => void;
}): Promise<ExecutionResult> {
  const vertexConfig = getVertexProjectConfig(input.settings.providerSettings);

  if (!vertexConfig.projectId) {
    throw new Error('Vertex AI project ID is missing. Add it in Settings before running Vertex video models.');
  }

  const bridge = getSignalLoomNativeBridge();

  if (!bridge?.generateVertexVideo) {
    throw new Error('Vertex AI video requires the Signal Loom desktop app with the native Vertex video bridge.');
  }

  validateGeminiVeoVideoRequest(input.modelId, input.prompt, input.context);
  const videoInputs = await buildGeminiVideoRequestInputs(input.context);
  const body = buildVertexVeoVideoRequestBody(
    {
      prompt: input.prompt,
      ...videoInputs,
    },
    {
      aspectRatio: input.context.config.aspectRatio,
      durationSeconds: input.context.config.durationSeconds,
      videoResolution: input.context.config.videoResolution,
      seed: input.seed,
      negativePrompt: input.negativePrompt,
      sampleCount: input.sampleCount,
    },
  );

  input.onStatus?.('Submitting video render to Vertex AI Veo…');
  const result = await bridge.generateVertexVideo({
    projectId: vertexConfig.projectId,
    location: resolveVertexVideoLocation(vertexConfig.location),
    auth: vertexConfig.auth,
    modelId: input.modelId,
    route: 'veo-predict-long-running',
    body,
  });

  if (result.error) {
    throw new Error(result.error);
  }

  if (!result.result) {
    throw new Error('Vertex AI did not return a video payload.');
  }

  return {
    result: result.result,
    resultType: 'video',
    statusMessage: result.statusMessage ?? `Generated ${input.context.config.durationSeconds}s ${input.context.config.videoResolution} video with ${input.modelId}`,
    usage: createGeminiVideoUsage(
      input.modelId,
      input.context.config.durationSeconds,
      input.context.config.videoResolution,
      'actual',
    ),
    mimeType: result.mimeType,
    extension: result.mimeType?.includes('webm') ? 'webm' : 'mp4',
  };
}

async function executeVertexOmniVideoNode(input: {
  modelId: string;
  prompt: string;
  context: ExecutionContext;
  settings: RuntimeSettingsSnapshot;
  onStatus?: (statusMessage: string) => void;
}): Promise<ExecutionResult> {
  const vertexConfig = getVertexProjectConfig(input.settings.providerSettings);

  if (!vertexConfig.projectId) {
    throw new Error('Vertex AI project ID is missing. Add it in Settings before running Vertex Gemini Omni video.');
  }

  const bridge = getSignalLoomNativeBridge();

  if (!bridge?.generateVertexVideo) {
    throw new Error('Vertex AI Gemini Omni video requires the Signal Loom desktop app with the native Vertex video bridge.');
  }

  const media = await buildOmniVideoMediaParts(input.context);

  if (!input.prompt.trim() && media.length === 0) {
    throw new Error('Gemini Omni video needs a prompt, image reference, or video reference.');
  }

  input.onStatus?.('Submitting video render to Vertex Gemini Omni…');
  const result = await bridge.generateVertexVideo({
    projectId: vertexConfig.projectId,
    location: resolveVertexVideoLocation(vertexConfig.location),
    auth: vertexConfig.auth,
    modelId: input.modelId,
    route: 'gemini-generate-content',
    apiVersion: 'v1beta1',
    body: buildVertexOmniVideoRequestBody({
      prompt: input.prompt,
      media,
    }),
  });

  if (result.error) {
    throw new Error(result.error);
  }

  if (!result.result) {
    throw new Error('Vertex Gemini Omni did not return a video payload.');
  }

  return {
    result: result.result,
    resultType: 'video',
    statusMessage: result.statusMessage ?? `Generated video with ${input.modelId}`,
    usage: createGeminiVideoUsage(
      input.modelId,
      input.context.config.durationSeconds,
      input.context.config.videoResolution,
      'actual',
    ),
    mimeType: result.mimeType,
    extension: result.mimeType?.includes('webm') ? 'webm' : 'mp4',
  };
}

async function executeGeminiOmniVideoNode(
  apiKey: string,
  modelId: string,
  prompt: string,
  context: ExecutionContext,
  onStatus?: (statusMessage: string) => void,
): Promise<ExecutionResult> {
  onStatus?.('Generating video with Gemini Omni…');
  const { GoogleGenAI } = await loadProviderModule(
    () => import('@google/genai'),
    'Google Gemini Omni video',
  );
  const client = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });
  const parts: PartUnion[] = [{ text: prompt }];
  const media = await buildOmniVideoMediaParts(context);

  for (const item of media) {
    if (item.instruction) {
      parts.push({ text: item.instruction });
    }
    parts.push({
      inlineData: item.inlineData,
    } as unknown as PartUnion);
  }

  if (!prompt.trim() && media.length === 0) {
    throw new Error('Gemini Omni video needs a prompt, image reference, or video reference.');
  }

  const response = await client.models.generateContent({
    model: modelId,
    contents: parts,
    config: {
      responseModalities: ['VIDEO'],
    },
  });
  const videoPart = extractGeminiInlineData(response);

  if (!videoPart?.mimeType.startsWith('video/')) {
    const text = extractGeminiTextResponse(response);
    throw new Error(
      text
        ? `Gemini Omni did not return inline video data. Provider response: ${text}`
        : 'Gemini Omni did not return inline video data. The public video API contract may still be rolling out.',
    );
  }

  return {
    result: await toResultUrl(inlineDataToBlob(videoPart.data, videoPart.mimeType)),
    resultType: 'video',
    statusMessage: `Generated video with ${modelId}`,
    usage: createGeminiVideoUsage(
      modelId,
      context.config.durationSeconds,
      context.config.videoResolution,
      'actual',
    ),
    mimeType: videoPart.mimeType,
    extension: videoPart.mimeType.includes('webm') ? 'webm' : 'mp4',
  };
}

function validateGeminiVeoVideoRequest(
  modelId: string,
  prompt: string,
  context: ExecutionContext,
): void {
  validateGeminiVideoRequest({
    aspectRatio: context.config.aspectRatio,
    durationSeconds: context.config.durationSeconds,
    videoResolution: context.config.videoResolution,
    modelId,
    promptProvided: Boolean(prompt.trim()),
    hasStartImage: Boolean(context.startImageInput),
    hasEndImage: Boolean(context.endImageInput),
    referenceImageCount: context.referenceImageInputs?.length ?? 0,
    hasExtensionVideo: Boolean(context.extensionVideoInput),
  });
}

async function buildGeminiVideoRequestInputs(context: ExecutionContext): Promise<{
  startImage?: Awaited<ReturnType<typeof dataUrlToGeminiImage>>;
  endImage?: Awaited<ReturnType<typeof dataUrlToGeminiImage>>;
  referenceImages?: Array<{
    image: Awaited<ReturnType<typeof dataUrlToGeminiImage>>;
    referenceType: VideoReferenceType;
  }>;
  extensionVideo?: Awaited<ReturnType<typeof dataUrlToGeminiVideo>>;
}> {
  const startImage = context.startImageInput ? await dataUrlToGeminiImage(context.startImageInput) : undefined;
  const endImage = context.endImageInput ? await dataUrlToGeminiImage(context.endImageInput) : undefined;
  const referenceImages = context.referenceImageInputs
    ? await Promise.all(
        context.referenceImageInputs.map(async (reference) => ({
          image: await dataUrlToGeminiImage(reference.url),
          referenceType: reference.referenceType,
        })),
      )
    : [];
  const extensionVideo = context.extensionVideoInput
    ? await dataUrlToGeminiVideo(context.extensionVideoInput)
    : undefined;

  return {
    ...(startImage ? { startImage } : {}),
    ...(endImage ? { endImage } : {}),
    ...(referenceImages.length > 0 ? { referenceImages } : {}),
    ...(extensionVideo ? { extensionVideo } : {}),
  };
}

async function buildOmniVideoMediaParts(context: ExecutionContext): Promise<Array<{
  inlineData: {
    data: string;
    mimeType: string;
  };
  instruction?: string;
}>> {
  const media: Array<{
    inlineData: {
      data: string;
      mimeType: string;
    };
    instruction?: string;
  }> = [];

  if (context.startImageInput) {
    media.push({
      instruction: 'Use this as the starting visual reference.',
      inlineData: await dataUrlToInlineImage(context.startImageInput),
    });
  }

  if (context.endImageInput) {
    media.push({
      instruction: 'Use this as the ending visual reference.',
      inlineData: await dataUrlToInlineImage(context.endImageInput),
    });
  }

  for (const reference of context.referenceImageInputs ?? []) {
    media.push({
      instruction: `Use this as a ${reference.referenceType} reference.`,
      inlineData: await dataUrlToInlineImage(reference.url),
    });
  }

  if (context.extensionVideoInput) {
    media.push({
      instruction: 'Continue, remix, or edit this source video.',
      inlineData: await dataUrlToInlineData(context.extensionVideoInput, 'video/mp4'),
    });
  }

  if (media.length > 5) {
    throw new Error('Gemini Omni video currently accepts up to five connected media references.');
  }

  return media;
}

function resolveVertexVideoLocation(location: string): string {
  const normalized = location.trim();
  return normalized === 'global' || normalized === 'us-west2'
    ? 'us-central1'
    : normalized || 'us-central1';
}

async function executeAudioNode(
  node: AppNode,
  context: ExecutionContext,
  settings: RuntimeSettingsSnapshot,
  onStatus?: (statusMessage: string) => void,
): Promise<ExecutionResult> {
  const provider = (node.data.provider as AudioProvider | undefined) ?? 'elevenlabs';
  const modelId = getModelId(settings, 'audio', provider, node.data.modelId);
  const audioMode = (node.data.audioGenerationMode as string | undefined) ?? 'speech';
  const prompt = context.prompt.trim();

  if (audioMode !== 'voiceChange' && !prompt) {
    throw new Error('Audio nodes need an upstream text prompt.');
  }

  switch (provider) {
    case 'gemini': {
      if (audioMode !== 'speech') {
        throw new Error('Gemini audio nodes currently support text-to-speech only.');
      }

      if (settings.providerSettings.geminiCredentialMode === 'vertex-adc') {
        throw new Error('Gemini TTS requires Gemini API-key mode in this build. Vertex mode will not fall back to a Gemini API key automatically.');
      }

      onStatus?.('Synthesizing audio with Gemini TTS…');
      const { GoogleGenAI } = await loadProviderModule(
        () => import('@google/genai'),
        'Google Gemini audio',
      );
      const apiKey = requireApiKey(settings.apiKeys.gemini, 'Google Gemini');
      const client = new GoogleGenAI({ apiKey });
      const voiceName = normalizeOptionalString(node.data.geminiVoiceName as string | undefined) ?? 'Kore';
      const ttsPrompt = buildGeminiTtsPrompt(
        prompt,
        normalizeOptionalString(node.data.audioStyleDescription as string | undefined),
      );
      const response = await client.models.generateContent({
        model: modelId,
        contents: [{ parts: [{ text: ttsPrompt }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
        },
      });
      const audioBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!audioBase64) {
        throw new Error('Gemini TTS did not return audio data.');
      }

      return {
        result: await toResultUrl(await pcmBase64ToWavBlob(audioBase64)),
        resultType: 'audio',
        statusMessage: `Generated with ${modelId}`,
        usage: buildAudioUsage('gemini', modelId, {
          confidence: 'unknown',
          notes: ['Gemini TTS pricing is not currently mapped in the app.'],
        }),
      };
    }
    case 'elevenlabs': {
      const apiKey = requireApiKey(settings.apiKeys.elevenlabs, 'ElevenLabs');
      const voiceId =
        normalizeOptionalString(node.data.voiceId as string | undefined) ??
        normalizeOptionalString(settings.providerSettings.elevenlabsVoiceId);

      if (audioMode === 'speech') {
        if (!voiceId) {
          throw new Error('Choose an ElevenLabs voice in the node or settings.');
        }

        onStatus?.('Synthesizing audio with ElevenLabs…');
        const response = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${context.config.audioOutputFormat}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'xi-api-key': apiKey,
            },
            body: JSON.stringify({
              text: prompt,
              model_id: modelId,
            }),
          },
        );

        if (!response.ok) {
          throw new Error(await extractErrorBody(response, 'ElevenLabs TTS failed'));
        }

        return {
          result: await toResultUrl(await response.blob()),
          resultType: 'audio',
          statusMessage: `Generated with ${modelId}`,
          usage: createElevenLabsTtsUsage(modelId, prompt, 'actual'),
        };
      }

      if (audioMode === 'soundEffect') {
        onStatus?.('Generating sound effect with ElevenLabs…');
        const response = await fetch(
          `https://api.elevenlabs.io/v1/sound-generation?output_format=${context.config.audioOutputFormat}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'xi-api-key': apiKey,
            },
            body: JSON.stringify({
              text: prompt,
              model_id: modelId,
              loop: Boolean(node.data.audioLoop),
              duration_seconds: coerceOptionalNumber(node.data.audioDurationSeconds),
              prompt_influence: coerceOptionalNumber(node.data.audioPromptInfluence),
            }),
          },
        );

        if (!response.ok) {
          throw new Error(await extractErrorBody(response, 'ElevenLabs sound effect generation failed'));
        }

        return {
          result: await toResultUrl(await response.blob()),
          resultType: 'audio',
          statusMessage: `Generated sound effect with ${modelId}`,
          usage: buildAudioUsage('elevenlabs', modelId, {
            characters: prompt.length,
            confidence: 'unknown',
            notes: ['ElevenLabs sound-effect pricing is not currently mapped in the app.'],
          }),
        };
      }

      if (!voiceId) {
        throw new Error('Choose an ElevenLabs voice in the node or settings.');
      }

      if (!context.audioSourceInput) {
        throw new Error('Voice changer mode needs an upstream audio node or imported audio asset.');
      }

      onStatus?.('Changing voice with ElevenLabs…');
      const sourceAudio = await fetch(context.audioSourceInput);
      const sourceBlob = await sourceAudio.blob();
      const formData = new FormData();
      formData.append('audio', sourceBlob, 'flow-audio-input.wav');
      formData.append('model_id', modelId);

      if (node.data.audioRemoveBackgroundNoise) {
        formData.append('remove_background_noise', 'true');
      }

      const seedValue = coerceOptionalNumber(node.data.audioSeed);

      if (seedValue !== undefined) {
        formData.append('seed', String(Math.max(0, Math.floor(seedValue))));
      }

      const response = await fetch(
        `https://api.elevenlabs.io/v1/speech-to-speech/${voiceId}?output_format=${context.config.audioOutputFormat}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
          },
          body: formData,
        },
      );

      if (!response.ok) {
        throw new Error(await extractErrorBody(response, 'ElevenLabs voice changer failed'));
      }

      return {
        result: await toResultUrl(await response.blob()),
        resultType: 'audio',
        statusMessage: `Changed voice with ${modelId}`,
        usage: buildAudioUsage('elevenlabs', modelId, {
          confidence: 'unknown',
          notes: ['ElevenLabs voice changer pricing is not currently mapped in the app.'],
        }),
      };
    }
    case 'huggingface': {
      if (audioMode !== 'speech') {
        throw new Error('Hugging Face audio nodes currently support text-to-speech only.');
      }

      onStatus?.('Generating audio with Hugging Face…');
      const { HfInference } = await loadProviderModule(
        () => import('@huggingface/inference'),
        'Hugging Face audio',
      );
      const apiKey = requireApiKey(settings.apiKeys.huggingface, 'Hugging Face');
      const client = new HfInference(apiKey);
      const blob = await client.textToSpeech({
        model: modelId,
        inputs: prompt,
      });

      return {
        result: await toResultUrl(blob),
        resultType: 'audio',
        statusMessage: `Generated with ${modelId}`,
      };
    }
  }
}

async function executeCompositionNode(
  _node: AppNode,
  context: ExecutionContext,
  settings: RuntimeSettingsSnapshot,
  onStatus?: (statusMessage: string) => void,
): Promise<ExecutionResult> {
  const visualSequenceClips = context.visualSequenceClips ?? [];
  const stageObjects = context.stageObjects ?? [];

  if (visualSequenceClips.length > 0 || stageObjects.length > 0) {
    onStatus?.('Rendering editor sequence locally…');
    const exportPreset = getVideoExportPresetOption(context.exportPresetId);
    const sequenceOutput = await composeSequenceMedia({
      visualClips: visualSequenceClips,
      audioTracks: context.sequenceAudioInputs ?? [],
      stageObjects,
      aspectRatio: context.config.aspectRatio,
      videoResolution: context.config.videoResolution,
      frameRate: context.config.videoFrameRate,
      exportPresetId: context.exportPresetId,
      providerSettings: settings.providerSettings,
      nativeAssemblyManifest: context.nativeAssemblyManifest,
    });
    const isImageSequence = Boolean(sequenceOutput.imageSequence);
    const segmentArtifacts = sequenceOutput.segmentArtifacts?.length
      ? sequenceOutput.segmentArtifacts
      : undefined;
    const assemblyResult = sequenceOutput.assemblyResult;
    const outputMetadata = sequenceOutput.manifest || segmentArtifacts || assemblyResult
      ? {
        ...(sequenceOutput.manifest
          ? {
            imageSequence: true,
            frameCount: sequenceOutput.frameCount ?? sequenceOutput.manifest.frameCount,
            manifest: sequenceOutput.manifest,
          }
          : {}),
        ...(segmentArtifacts ? { segmentArtifacts } : {}),
        ...(assemblyResult ? { assemblyResult } : {}),
      }
      : undefined;

    return {
      result: await toResultUrl(sequenceOutput.blob),
      resultType: isImageSequence ? 'package' : 'video',
      blob: sequenceOutput.blob,
      statusMessage: isImageSequence
        ? `Rendered ${sequenceOutput.frameCount ?? 0} ${exportPreset.extension.toUpperCase()} sequence frame${sequenceOutput.frameCount === 1 ? '' : 's'} at ${context.config.videoFrameRate} fps using ${exportPreset.label} with ${describeSequenceRenderBackend(sequenceOutput.renderBackend)}. Output is a ZIP archive with manifest.json; audio tracks are ignored for image sequence exports. ${describeSequenceRenderBackendCaveat(sequenceOutput.renderBackend)}`
        : `Rendered editor sequence with ${visualSequenceClips.length} visual clip${visualSequenceClips.length === 1 ? '' : 's'} and ${stageObjects.length} stage object${stageObjects.length === 1 ? '' : 's'} at ${context.config.videoFrameRate} fps using ${exportPreset.label} with ${describeSequenceRenderBackend(sequenceOutput.renderBackend)}. ${describeSequenceRenderBackendCaveat(sequenceOutput.renderBackend)}`,
      usage: createLocalCompositionUsage('actual'),
      mimeType: sequenceOutput.mimeType,
      extension: sequenceOutput.extension,
      fileName: sequenceOutput.fileName,
      outputMetadata,
    };
  }

  if (!context.videoInput) {
    throw new Error('Composition nodes need an upstream video connected to the Video track.');
  }

  onStatus?.('Mixing video and audio locally…');
  const audioInputs = context.audioInputs ?? [];
  const enabledAudioInputs = audioInputs.filter((track) => track.enabled);

  if (enabledAudioInputs.length === 0 && !context.useVideoAudio) {
    return {
      result: context.videoInput,
      resultType: 'video',
      statusMessage: 'Composition is previewing the connected video only.',
      usage: createLocalCompositionUsage('actual'),
    };
  }

  const blob = await composeMedia({
    videoUrl: context.videoInput,
    audioTracks: audioInputs,
    useVideoAudio: context.useVideoAudio,
    videoAudioVolumePercent: context.videoAudioVolumePercent,
    providerSettings: settings.providerSettings,
  });

  return {
    result: await toResultUrl(blob),
    resultType: 'video',
    blob,
    statusMessage:
      enabledAudioInputs.length > 0
        ? `Mixed ${enabledAudioInputs.length} audio track${enabledAudioInputs.length === 1 ? '' : 's'} into the composition.`
        : 'Composition preserved the source video audio.',
    usage: createLocalCompositionUsage('actual'),
  };
}

function composePrompt(upstreamPrompt: string, nodePrompt: string): string {
  const contextPrompt = upstreamPrompt.trim();
  const instructionPrompt = nodePrompt.trim();

  if (contextPrompt && instructionPrompt) {
    return `Context:\n${contextPrompt}\n\nInstruction:\n${instructionPrompt}`;
  }

  return instructionPrompt || contextPrompt;
}

function normalizeTextMediaInputs(context: ExecutionContext): GeminiTextMediaInput[] {
  if (context.textMediaInputs) {
    return context.textMediaInputs;
  }

  return (context.textImageInputs ?? []).map((url) => ({
    url,
    mimeType: 'image/png',
    kind: 'image',
  }));
}

function isImageMediaInput(input: GeminiTextMediaInput): boolean {
  return input.kind === 'image' || input.mimeType?.toLowerCase().startsWith('image/') === true;
}

function buildChatMessages(systemPrompt: string, userPrompt: string) {
  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];

  if (systemPrompt.trim()) {
    messages.push({ role: 'system', content: systemPrompt.trim() });
  }

  messages.push({ role: 'user', content: userPrompt });
  return messages;
}

async function buildOpenAITextMessages(
  systemPrompt: string,
  userPrompt: string,
  imageInputs: string[],
): Promise<ChatCompletionMessageParam[]> {
  if (imageInputs.length === 0) {
    return buildChatMessages(systemPrompt, userPrompt);
  }

  const messages: ChatCompletionMessageParam[] = [];

  if (systemPrompt.trim()) {
    messages.push({ role: 'system', content: systemPrompt.trim() });
  }

  messages.push({
    role: 'user',
    content: [
      { type: 'text', text: userPrompt },
      ...imageInputs.map((url) => ({
        type: 'image_url' as const,
        image_url: { url },
      })),
    ],
  });

  return messages;
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

function requireApiKey(value: string, label: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${label} API key is missing. Add it in Settings.`);
  }

  return trimmed;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function extractTextContent(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        if (isRecord(part) && typeof part.text === 'string') {
          return part.text;
        }

        return '';
      })
      .join('')
      .trim();
  }

  return '';
}

function extractGeminiInlineData(
  response: {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: {
            mimeType?: string;
            data?: string;
          };
        }>;
      };
    }>;
  },
): { mimeType: string; data: string } | null {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((part): part is { inlineData: { mimeType?: string; data?: string } } =>
    Boolean(part.inlineData?.data),
  );

  if (!imagePart?.inlineData?.data) {
    return null;
  }

  return {
    mimeType: imagePart.inlineData.mimeType ?? 'image/png',
    data: imagePart.inlineData.data,
  };
}

function extractGeminiTextResponse(
  response: {
    text?: string;
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          thought?: boolean;
          executableCode?: {
            code?: string;
            language?: string;
          };
          codeExecutionResult?: {
            output?: string;
          };
        }>;
      };
    }>;
  },
): string {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const renderedParts = parts.flatMap((part) => {
    if (part.text && !part.thought) {
      return [part.text.trim()];
    }

    if (part.executableCode?.code) {
      const language = part.executableCode.language?.toLowerCase() ?? 'python';
      return [`\`\`\`${language}\n${part.executableCode.code.trim()}\n\`\`\``];
    }

    if (part.codeExecutionResult?.output) {
      return [`Code execution result:\n${part.codeExecutionResult.output.trim()}`];
    }

    return [];
  });

  return (renderedParts.length > 0 ? renderedParts.join('\n\n') : response.text ?? '').trim();
}

async function startGeminiVideoGeneration(
  apiKey: string,
  modelId: string,
  prompt: string,
  context: ExecutionContext,
  seed?: number,
  negativePrompt?: string,
  sampleCount?: number,
): Promise<GeminiVideoOperation> {
  const normalizedModelId = normalizeGeminiVideoModelId(modelId);

  validateGeminiVideoRequest({
    aspectRatio: context.config.aspectRatio,
    durationSeconds: context.config.durationSeconds,
    videoResolution: context.config.videoResolution,
    modelId: normalizedModelId,
    promptProvided: Boolean(prompt.trim()),
    hasStartImage: Boolean(context.startImageInput),
    hasEndImage: Boolean(context.endImageInput),
    referenceImageCount: context.referenceImageInputs?.length ?? 0,
    hasExtensionVideo: Boolean(context.extensionVideoInput),
  });

  const videoInputs = await buildGeminiVideoRequestInputs(context);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${normalizedModelId}:predictLongRunning`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(
          buildGeminiVideoRequest(
            {
              prompt,
              ...videoInputs,
            },
            {
              aspectRatio: context.config.aspectRatio,
              durationSeconds: context.config.durationSeconds,
              videoResolution: context.config.videoResolution,
              seed,
              negativePrompt,
              sampleCount,
            },
          ),
        ),
      },
    );

    if (!response.ok) {
      throw new Error(await extractErrorBody(response, 'Gemini video generation failed'));
    }

    return (await response.json()) as GeminiVideoOperation;
  } catch (error) {
    throw new Error(extractSdkErrorMessage(error, 'Gemini video generation failed'));
  }
}

async function pollGeminiVideoResult(
  apiKey: string,
  operation: GeminiVideoOperation,
  onStatus?: (statusMessage: string) => void,
): Promise<Blob> {
  let currentOperation = operation;

  for (let attempt = 0; attempt < 45; attempt += 1) {
    if (currentOperation.error) {
      throw new Error(extractSdkOperationError(currentOperation.error));
    }

    if (currentOperation.done) {
      const video = currentOperation.response?.generateVideoResponse?.generatedSamples?.[0]?.video;

      if (!video) {
        throw new Error('Gemini finished the job but did not provide a generated video.');
      }

      if (!video.uri) {
        throw new Error('Gemini finished the job but did not provide a downloadable video URI.');
      }

      onStatus?.('Downloading completed video…');
      const videoResponse = await fetch(video.uri, {
        headers: {
          'x-goog-api-key': apiKey,
        },
      });

      if (!videoResponse.ok) {
        throw new Error(await extractErrorBody(videoResponse, 'Failed to download Gemini video'));
      }

      return videoResponse.blob();
    }

    onStatus?.(`Video render is still in progress… ${attempt + 1} check${attempt === 0 ? '' : 's'} so far`);
    await sleep(10_000);

    if (!currentOperation.name) {
      throw new Error('Gemini video generation started without an operation name.');
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${currentOperation.name}`, {
      headers: {
        'x-goog-api-key': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(await extractErrorBody(response, 'Gemini video status polling failed'));
    }

    currentOperation = (await response.json()) as GeminiVideoOperation;
  }

  throw new Error('Gemini video generation timed out after waiting 7.5 minutes.');
}

function extractOpenAIImageUsage(
  response: unknown,
  modelId: string,
  provider: 'openai' | 'atlas',
): UsageTelemetry | undefined {
  const usage = (response as { usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } }).usage;

  if (!usage) {
    return undefined;
  }

  return {
    source: 'actual',
    confidence: 'measured',
    provider,
    modelId,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens,
    notes: ['Pricing for this OpenAI image model is not currently mapped in the app.'],
  };
}

async function executeOpenAiCompatibleImageNode(input: {
  provider: 'openai' | 'atlas';
  modelId: string;
  prompt: string;
  sourceImageInput?: string;
  maskImageInput?: string;
  referenceImageInputs?: string[];
  context: ExecutionContext;
  node: AppNode;
  settings: RuntimeSettingsSnapshot;
  onStatus?: (statusMessage: string) => void;
}): Promise<ExecutionResult> {
  if (input.provider === 'openai' && input.sourceImageInput && input.referenceImageInputs?.length) {
    throw new Error('OpenAI image nodes support source image and mask edits, but not separate reference-image guidance.');
  }

  const providerLabel = input.provider === 'atlas' ? 'Atlas' : 'OpenAI';
  const apiKey = requireApiKey(
    input.provider === 'atlas' ? (input.settings.apiKeys.atlas ?? '') : input.settings.apiKeys.openai,
    providerLabel,
  );
  const baseUrl = input.provider === 'atlas'
    ? input.settings.providerSettings.atlasBaseUrl
    : input.settings.providerSettings.openaiBaseUrl;
  const aspectRatio = getSupportedImageAspectRatio('openai', input.modelId, input.context.config.aspectRatio);
  const { default: OpenAI } = await loadProviderModule(
    () => import('openai'),
    `${providerLabel} image`,
  );

  input.onStatus?.(input.sourceImageInput ? `Editing image with ${providerLabel}…` : `Generating image with ${providerLabel}…`);
  const client = new OpenAI({
    apiKey,
    baseURL: normalizeOptionalString(baseUrl),
    dangerouslyAllowBrowser: true,
  });
  const response = input.sourceImageInput
    ? await client.images.edit({
        model: input.modelId,
        image: await dataUrlToFile(input.sourceImageInput, 'flow-image-edit.png'),
        ...(input.maskImageInput ? { mask: new File([await normalizeMaskBlob(input.maskImageInput, input.sourceImageInput!, input.provider, input.modelId)], 'flow-image-mask.png', { type: 'image/png' }) } : {}),
        prompt: input.prompt,
        size: mapAspectRatioToImageSize(aspectRatio),
      })
    : await client.images.generate({
        model: input.modelId,
        prompt: input.prompt,
        size: mapAspectRatioToImageSize(aspectRatio),
      });
  const image = response.data?.[0];

  if (image?.b64_json) {
    return applyConfiguredAutoUpscaleIfRequested({
      node: input.node,
      settings: input.settings,
      context: input.context,
      result: {
        result: `data:image/png;base64,${image.b64_json}`,
        resultType: 'image',
        statusMessage: `Generated with ${input.modelId}`,
        usage: extractOpenAIImageUsage(response, input.modelId, input.provider),
      },
      onStatus: input.onStatus,
    });
  }

  if (image?.url) {
    return applyConfiguredAutoUpscaleIfRequested({
      node: input.node,
      settings: input.settings,
      context: input.context,
      result: {
        result: image.url,
        resultType: 'image',
        statusMessage: `Generated with ${input.modelId}`,
        usage: extractOpenAIImageUsage(response, input.modelId, input.provider),
      },
      onStatus: input.onStatus,
    });
  }

  throw new Error(`${providerLabel} did not return an image payload.`);
}

async function dataUrlToInlineImage(dataUrl: string): Promise<{ mimeType: string; data: string }> {
  return dataUrlToInlineData(dataUrl, 'image/png', 'Unsupported image data URL format.');
}

async function dataUrlToInlineData(
  dataUrl: string,
  fallbackMimeType: string,
  dataUrlError = 'Unsupported media data URL format.',
): Promise<{ mimeType: string; data: string }> {
  if (dataUrl.startsWith('data:')) {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);

    if (!match) {
      throw new Error(dataUrlError);
    }

    return {
      mimeType: match[1],
      data: match[2],
    };
  }

  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const base64 = await blobToBase64(blob);

  return {
    mimeType: blob.type || fallbackMimeType,
    data: base64,
  };
}

async function dataUrlToGeminiImage(dataUrl: string): Promise<{ imageBytes: string; mimeType: string }> {
  if (dataUrl.startsWith('data:')) {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);

    if (!match) {
      throw new Error('Unsupported image data URL format.');
    }

    return {
      mimeType: match[1],
      imageBytes: match[2],
    };
  }

  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const base64 = await blobToBase64(blob);

  return {
    mimeType: blob.type || 'image/png',
    imageBytes: base64,
  };
}

async function dataUrlToGeminiVideo(dataUrl: string): Promise<{ videoBytes: string; mimeType: string }> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const base64 = await blobToBase64(blob);

  return {
    mimeType: blob.type || 'video/mp4',
    videoBytes: base64,
  };
}

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const mimeType = blob.type || 'image/png';

  return new File([blob], filename, { type: mimeType });
}

/** Normalize a canonical painted/connected mask to the encoding `provider`/`modelId` expects, sized to the source image. */
async function normalizeMaskBlob(
  maskDataUrl: string,
  sourceDataUrl: string,
  provider: string,
  modelId: string | undefined,
): Promise<Blob> {
  if (!canDecodeImages()) {
    // Skip Image/canvas dimension probing in headless envs; normalizeMaskForProvider passes through.
    return normalizeMaskForProvider(maskDataUrl, { provider, modelId, width: 0, height: 0 });
  }
  const { width, height } = await getDataUrlDimensions(sourceDataUrl);
  return normalizeMaskForProvider(maskDataUrl, { provider, modelId, width, height });
}

async function toResultUrl(value: Blob | string): Promise<string> {
  return typeof value === 'string' ? value : URL.createObjectURL(value);
}

async function blobToBase64(blob: Blob): Promise<string> {
  if (typeof FileReader === 'undefined') {
    const arrayBuffer = await blob.arrayBuffer();
    return Buffer.from(arrayBuffer).toString('base64');
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read blob.'));
    reader.readAsDataURL(blob);
  });

  const [, base64 = ''] = dataUrl.split(',', 2);
  return base64;
}

function inlineDataToBlob(data: string, mimeType: string): Blob {
  const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

async function extractErrorBody(response: Response, fallback: string): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as { error?: { message?: string }; message?: string };
    return payload.error?.message ?? payload.message ?? `${fallback} (${response.status})`;
  }

  const text = await response.text();
  return text || `${fallback} (${response.status})`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function coerceOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

async function pcmBase64ToWavBlob(base64: string, sampleRate = 24_000): Promise<Blob> {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const byteRate = sampleRate * 2;

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + bytes.length, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, bytes.length, true);

  return new Blob([header, bytes], { type: 'audio/wav' });
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function buildAudioUsage(
  provider: string,
  modelId: string,
  options: {
    characters?: number;
    confidence: UsageTelemetry['confidence'];
    notes?: string[];
  },
): UsageTelemetry {
  return {
    source: 'actual',
    confidence: options.confidence,
    provider,
    modelId,
    characters: options.characters,
    notes: options.notes,
  };
}

function extractSdkErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message || fallback;
  }

  if (isRecord(error) && typeof error.message === 'string') {
    return error.message;
  }

  return fallback;
}

function extractSdkOperationError(error: Record<string, unknown>): string {
  if (typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }

  return JSON.stringify(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}
