import type {
  AppNode,
  EditorAudioKeyframe,
  EditorStageObject,
  AudioProvider,
  ExecutionConfig,
  ImageProvider,
  ResultType,
  RuntimeSettingsSnapshot,
  TextProvider,
  UsageTelemetry,
  VideoReferenceType,
  VideoProvider,
} from '../types/flow';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import {
  createElevenLabsTtsUsage,
  createGeminiImageUsage,
  createGeminiVideoUsage,
  createLocalCompositionUsage,
  createLocalFrameExtractionUsage,
  createMeasuredTextUsage,
} from './costEstimation';
import {
  supportsImageEditing,
  supportsImageReferenceGuidance,
} from './imageModelSupport';
import { buildGeminiImagePrompt } from './geminiImagePrompt';
import { buildGeminiTtsPrompt } from './geminiTtsPrompt';
import { validateGeminiVideoRequest } from './geminiVideoValidation';
import { buildGeminiVideoRequest } from './geminiVideoRequest';
import { loadProviderModule } from './dynamicImportRecovery';
import { composeMedia, composeSequenceMedia } from './mediaComposition';
import type { ManualEditorVisualSequenceClip } from './manualEditorSequence';
import type { TimelineAutomationPoint } from '../types/flow';
import {
  mapAspectRatioToImageDimensions,
  mapAspectRatioToImageSize,
} from './providerCatalog';
import { extractSelectedVideoFrame } from './videoFrameExtraction';
import { normalizeGeminiVideoModelId } from './videoModelSupport';
import {
  buildBackendProxyExecuteRequest,
  shouldUseBackendProxy,
} from './backendProxy';

export interface ExecutionContext {
  prompt: string;
  config: ExecutionConfig;
  textImageInputs?: string[];
  editImageInput?: string;
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
}

interface ExecutionResult {
  result: string;
  resultType: ResultType;
  statusMessage: string;
  usage?: UsageTelemetry;
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

export async function executeNodeRequest(
  node: AppNode,
  context: ExecutionContext,
  settings: RuntimeSettingsSnapshot,
  onStatus?: (statusMessage: string) => void,
  options: { signal?: AbortSignal } = {},
): Promise<ExecutionResult> {
  throwIfAborted(options.signal);

  if (shouldProxyNodeExecution(node, settings)) {
    return executeNodeViaBackendProxy(node, context, settings, onStatus, options.signal);
  }

  switch (node.type) {
    case 'textNode':
      return executeTextNode(node, context, settings, onStatus);
    case 'imageGen':
      return executeImageNode(node, context, settings, onStatus);
    case 'videoGen':
      return executeVideoNode(node, context, settings, onStatus);
    case 'audioGen':
      return executeAudioNode(node, context, settings, onStatus);
    case 'composition':
      return executeCompositionNode(node, context, settings, onStatus);
    default:
      throw new Error(`Unsupported node type: ${node.type}`);
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
  const textImageInputs = context.textImageInputs ?? [];
  const effectivePrompt = combinedPrompt || (textImageInputs.length > 0 ? 'Describe this image in detail.' : '');
  const systemPrompt = (node.data.systemPrompt ?? '').trim();

  if (!effectivePrompt) {
    throw new Error('Connect a prompt source or enter an instruction in this text node.');
  }

  switch (provider) {
    case 'gemini': {
      onStatus?.(textImageInputs.length > 0 ? 'Analyzing image with Gemini…' : 'Generating text with Gemini…');
      const { GoogleGenerativeAI } = await loadProviderModule(
        () => import('@google/generative-ai'),
        'Google Gemini text',
      );
      const apiKey = requireApiKey(settings.apiKeys.gemini, 'Google Gemini');
      const client = new GoogleGenerativeAI(apiKey);
      const model = client.getGenerativeModel({
        model: modelId,
        systemInstruction: systemPrompt || undefined,
      });
      const response = await model.generateContent(
        textImageInputs.length > 0
          ? [
              { text: effectivePrompt },
              ...await Promise.all(
                textImageInputs.map(async (imageUrl) => ({
                  inlineData: await dataUrlToInlineImage(imageUrl),
                })),
              ),
            ]
          : effectivePrompt,
      );
      const usage = response.response.usageMetadata;

      return {
        result: response.response.text().trim(),
        resultType: 'text',
        statusMessage: `Generated with ${modelId}`,
        usage:
          usage
            ? createMeasuredTextUsage('gemini', modelId, {
                inputTokens: usage.promptTokenCount,
                outputTokens: usage.candidatesTokenCount,
              })
            : undefined,
      };
    }
    case 'openai': {
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
      if (textImageInputs.length > 0) {
        throw new Error('Image-to-text is currently wired for Gemini and OpenAI text models in this app.');
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
  const referenceImageInputs = context.editReferenceImageInputs ?? [];
  const sourceVideoInput = context.sourceVideoInput;
  const videoFrameSelection = ((node.data.videoFrameSelection as 'first' | 'last' | undefined) ?? 'last');

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

  if (referenceImageInputs.length > 0 && !supportsImageReferenceGuidance(provider, modelId)) {
    throw new Error('Reference-image guidance is currently wired for Gemini image models only.');
  }

  switch (provider) {
    case 'gemini': {
      onStatus?.(
        sourceImageInput
          ? 'Editing image with Gemini…'
          : referenceImageInputs.length > 0
            ? 'Generating reference-guided image with Gemini…'
            : 'Generating image with Gemini…',
      );
      const { GoogleGenAI } = await loadProviderModule(
        () => import('@google/genai'),
        'Google Gemini image',
      );
      const apiKey = requireApiKey(settings.apiKeys.gemini, 'Google Gemini');
      const client = new GoogleGenAI({ apiKey });
      const geminiParts: Array<{ text: string } | { inlineData: Awaited<ReturnType<typeof dataUrlToInlineImage>> }> = [{
        text: buildGeminiImagePrompt(prompt, {
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
            aspectRatio: context.config.aspectRatio,
          },
        },
      });
      const imagePart = extractGeminiInlineData(response);

      if (!imagePart) {
        throw new Error('Gemini returned text only. Try a more explicit image-generation prompt.');
      }

      return {
        result: `data:${imagePart.mimeType};base64,${imagePart.data}`,
        resultType: 'image',
        statusMessage: `Generated with ${modelId}`,
        usage: createGeminiImageUsage(
          modelId,
          prompt,
          context.config.aspectRatio,
          'actual',
          response.usageMetadata?.promptTokenCount,
        ),
      };
    }
    case 'openai': {
      if (referenceImageInputs.length > 0) {
        throw new Error('Reference-image guidance is currently supported for Gemini image models only.');
      }

      onStatus?.(sourceImageInput ? 'Editing image with OpenAI…' : 'Generating image with OpenAI…');
      const { default: OpenAI } = await loadProviderModule(
        () => import('openai'),
        'OpenAI image',
      );
      const apiKey = requireApiKey(settings.apiKeys.openai, 'OpenAI');
      const client = new OpenAI({
        apiKey,
        baseURL: normalizeOptionalString(settings.providerSettings.openaiBaseUrl),
        dangerouslyAllowBrowser: true,
      });
      const response = sourceImageInput
        ? await client.images.edit({
            model: modelId,
            image: await dataUrlToFile(sourceImageInput, 'flow-image-edit.png'),
            prompt,
            size: mapAspectRatioToImageSize(context.config.aspectRatio),
          })
        : await client.images.generate({
            model: modelId,
            prompt,
            size: mapAspectRatioToImageSize(context.config.aspectRatio),
          });
      const image = response.data?.[0];

      if (image?.b64_json) {
        return {
          result: `data:image/png;base64,${image.b64_json}`,
          resultType: 'image',
          statusMessage: `Generated with ${modelId}`,
          usage: extractOpenAIImageUsage(response, modelId),
        };
      }

      if (image?.url) {
        return {
          result: image.url,
          resultType: 'image',
          statusMessage: `Generated with ${modelId}`,
          usage: extractOpenAIImageUsage(response, modelId),
        };
      }

      throw new Error('OpenAI did not return an image payload.');
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
        inputs: prompt,
        parameters: {
          num_inference_steps: context.config.steps,
          width,
          height,
        },
      });

      return {
        result: await toResultUrl(blob),
        resultType: 'image',
        statusMessage: `Generated with ${modelId}`,
      };
    }
  }
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
      const apiKey = requireApiKey(settings.apiKeys.gemini, 'Google Gemini');
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
  }
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
    const blob = await composeSequenceMedia({
      visualClips: visualSequenceClips,
      audioTracks: context.sequenceAudioInputs ?? [],
      stageObjects,
      aspectRatio: context.config.aspectRatio,
      videoResolution: context.config.videoResolution,
      providerSettings: settings.providerSettings,
    });

    return {
      result: await toResultUrl(blob),
      resultType: 'video',
      statusMessage: `Rendered editor sequence with ${visualSequenceClips.length} visual clip${visualSequenceClips.length === 1 ? '' : 's'} and ${stageObjects.length} stage object${stageObjects.length === 1 ? '' : 's'}.`,
      usage: createLocalCompositionUsage('actual'),
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
              startImage,
              endImage,
              referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
              extensionVideo,
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
): UsageTelemetry | undefined {
  const usage = (response as { usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } }).usage;

  if (!usage) {
    return undefined;
  }

  return {
    source: 'actual',
    confidence: 'measured',
    provider: 'openai',
    modelId,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens,
    notes: ['Pricing for this OpenAI image model is not currently mapped in the app.'],
  };
}

async function dataUrlToInlineImage(dataUrl: string): Promise<{ mimeType: string; data: string }> {
  if (dataUrl.startsWith('data:')) {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);

    if (!match) {
      throw new Error('Unsupported image data URL format.');
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
    mimeType: blob.type || 'image/png',
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

async function toResultUrl(value: Blob | string): Promise<string> {
  return typeof value === 'string' ? value : URL.createObjectURL(value);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read blob.'));
    reader.readAsDataURL(blob);
  });

  const [, base64 = ''] = dataUrl.split(',', 2);
  return base64;
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
    window.setTimeout(resolve, ms);
  });
}
