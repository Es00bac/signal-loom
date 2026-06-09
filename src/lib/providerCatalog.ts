import type {
  ApiKeys,
  AspectRatio,
  AudioOutputFormat,
  Capability,
  DefaultModelSettings,
  ExecutionConfig,
  ImageOutputFormat,
  ModelCatalog,
  ProviderSettings,
  RenderBackendPreference,
  ProviderForCapability,
  SelectOption,
  VideoResolution,
  VoiceOption,
} from '../types/flow';

export const PROVIDER_LABELS = {
  gemini: 'Google Gemini',
  openai: 'OpenAI / Compatible',
  atlas: 'Atlas Cloud',
  huggingface: 'Hugging Face',
  bfl: 'Black Forest Labs',
  stability: 'Stability AI',
  localOpen: 'Local / Open Models',
  android: 'Android Accelerator',
  elevenlabs: 'ElevenLabs',
} as const;

export const CAPABILITY_PROVIDERS = {
  text: ['gemini', 'openai', 'huggingface'],
  image: ['gemini', 'openai', 'atlas', 'huggingface', 'bfl', 'stability', 'localOpen', 'android'],
  video: ['gemini', 'huggingface'],
  audio: ['gemini', 'elevenlabs', 'huggingface'],
} as const;

export const DEFAULT_MODELS: DefaultModelSettings = {
  text: {
    gemini: 'gemini-3.5-flash',
    openai: 'gpt-4.1-mini',
    huggingface: 'Qwen/Qwen3-4B-Instruct-2507',
  },
  image: {
    gemini: 'gemini-3.1-flash-image',
    openai: 'gpt-image-2',
    atlas: 'black-forest-labs/flux-schnell',
    huggingface: 'black-forest-labs/FLUX.1-dev',
    bfl: 'flux-2-pro',
    stability: 'stable-image-edit-inpaint',
    localOpen: 'Qwen/Qwen-Image-Edit',
    android: 'local-dream-active',
  },
  video: {
    gemini: 'veo-3.1-generate-001',
    huggingface: 'Wan-AI/Wan2.2-T2V-A14B',
  },
  audio: {
    gemini: 'gemini-3.1-flash-tts-preview',
    elevenlabs: 'eleven_multilingual_v2',
    huggingface: 'hexgrad/Kokoro-82M',
  },
};

export const DEFAULT_PROVIDER_SETTINGS = {
  openaiBaseUrl: '',
  atlasBaseUrl: '',
  elevenlabsVoiceId: '',
  renderBackendPreference: 'auto' as RenderBackendPreference,
  localNativeRenderUrl: 'http://127.0.0.1:41736',
  localNativeRenderToken: '',
  backendProxyEnabled: false,
  backendProxyBaseUrl: '',
  geminiCredentialMode: 'vertex-adc',
  vertexAuthMode: 'gcloud-adc',
  vertexProjectId: 'project-76c3c7fb-e370-4080-8c8',
  vertexLocation: 'us-central1',
  vertexQuotaProjectId: '',
  vertexEnvironmentVariables: '',
  paperPrintUpscaleMethod: 'auto',
  paperPdfRasterPreset: 'balanced-jpeg',
  localOpenImageEndpointUrl: '',
  localOpenImageAuthHeader: '',
  localOpenImageDefaultModel: 'Qwen/Qwen-Image-Edit',
  genericImageEndpointUrl: '',
  genericImageAuthHeader: '',
  localAiCpuEndpointUrl: '',
  localAiCpuAuthHeader: '',
  localAiCpuModel: 'realesrgan-4x',
  androidAcceleratorBaseUrl: '',
  androidAcceleratorAuthToken: '',
  androidAcceleratorDefaultUpscaler: 'upscaler_realistic',
  androidAcceleratorDefaultImageModel: 'local-dream-active',
  batchMaxRetries: 10,
  batchRetryBaseDelayMs: 30000,
} as ProviderSettings;

export const RENDER_BACKEND_OPTIONS: SelectOption[] = [
  { value: 'auto', label: 'Auto (prefer AMD VAAPI GPU, then native CPU, then browser)' },
  { value: 'browser', label: 'Browser FFmpeg (maximum compatibility)' },
  { value: 'native-cpu', label: 'Native FFmpeg CPU (multithreaded)' },
  { value: 'native-amd-vaapi', label: 'Native FFmpeg AMD VAAPI GPU (forced)' },
];

export const VERTEX_AUTH_MODE_OPTIONS: SelectOption[] = [
  { value: 'gcloud-user', label: 'gcloud user login (simple desktop setup)' },
  { value: 'gcloud-adc', label: 'Application Default Credentials / service account' },
];

export const PAPER_PRINT_UPSCALE_METHOD_OPTIONS: SelectOption[] = [
  { value: 'auto', label: 'Auto: Android accelerator when configured, then Stability Fast, then Vertex, then local' },
  { value: 'android-accelerator', label: 'Android accelerator (LAN NPU/GPU upscaler, free after setup)' },
  { value: 'stability-fast', label: 'Stability Fast (AI 4x, 2 credits / $0.02, then exact local fit)' },
  { value: 'stability-conservative', label: 'Stability Conservative (AI 4MP, 40 credits / $0.40, then exact local fit)' },
  { value: 'vertex-imagen', label: 'Vertex Imagen upscale when available' },
  { value: 'local-ai-cpu', label: 'Local CPU AI upscaler (requires installed runtime; avoids GPU)' },
  { value: 'local-browser', label: 'Local browser scaling only (free, no cloud call)' },
];

export const PAPER_PDF_RASTER_PRESET_OPTIONS: SelectOption[] = [
  { value: 'balanced-jpeg', label: 'Balanced JPEG PDF (smaller, 240 DPI cap)' },
  { value: 'print-png', label: 'Print PNG PDF (lossless, largest)' },
  { value: 'proof-jpeg', label: 'Proof JPEG PDF (small, 150 DPI cap)' },
];

export const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
  aspectRatio: '1:1',
  steps: 30,
  durationSeconds: 6,
  videoResolution: '720p',
  videoFrameRate: 30,
  imageOutputFormat: 'png',
  audioOutputFormat: 'mp3_44100_128',
};

export const ASPECT_RATIO_OPTIONS: SelectOption[] = [
  { value: '1:1', label: '1:1 Square' },
  { value: '16:9', label: '16:9 Landscape' },
  { value: '9:16', label: '9:16 Portrait' },
];

export const GEMINI_IMAGE_ASPECT_RATIO_OPTIONS: SelectOption[] = [
  { value: '1:1', label: '1:1 Square' },
  { value: '2:3', label: '2:3 Portrait' },
  { value: '3:2', label: '3:2 Landscape' },
  { value: '3:4', label: '3:4 Portrait' },
  { value: '4:3', label: '4:3 Landscape' },
  { value: '4:5', label: '4:5 Portrait' },
  { value: '5:4', label: '5:4 Landscape' },
  { value: '9:16', label: '9:16 Portrait' },
  { value: '16:9', label: '16:9 Landscape' },
  { value: '21:9', label: '21:9 Ultrawide' },
];

export const GEMINI_25_FLASH_IMAGE_ASPECT_RATIO_OPTIONS: SelectOption[] = [
  { value: '1:1', label: '1:1 Square' },
  { value: '3:4', label: '3:4 Portrait' },
  { value: '4:3', label: '4:3 Landscape' },
  { value: '9:16', label: '9:16 Portrait' },
  { value: '16:9', label: '16:9 Landscape' },
];

export const VERTEX_IMAGEN_IMAGE_ASPECT_RATIO_OPTIONS: SelectOption[] = [
  ...GEMINI_25_FLASH_IMAGE_ASPECT_RATIO_OPTIONS,
];

export const OPENAI_IMAGE_ASPECT_RATIO_OPTIONS: SelectOption[] = [
  { value: '1:1', label: '1:1 Square' },
  { value: '3:2', label: '3:2 Landscape' },
  { value: '2:3', label: '2:3 Portrait' },
];

export const HUGGING_FACE_IMAGE_ASPECT_RATIO_OPTIONS: SelectOption[] = [
  ...GEMINI_IMAGE_ASPECT_RATIO_OPTIONS,
];

export const IMAGE_ASPECT_RATIO_OPTIONS: SelectOption[] = [
  ...GEMINI_IMAGE_ASPECT_RATIO_OPTIONS,
];

export const IMAGE_STEP_OPTIONS: SelectOption[] = [
  { value: '20', label: '20 steps' },
  { value: '30', label: '30 steps' },
  { value: '40', label: '40 steps' },
  { value: '50', label: '50 steps' },
  { value: '60', label: '60 steps' },
];

export const VIDEO_DURATION_OPTIONS: SelectOption[] = [
  { value: '4', label: '4 seconds' },
  { value: '6', label: '6 seconds' },
  { value: '8', label: '8 seconds' },
];

export const VIDEO_RESOLUTION_OPTIONS: SelectOption[] = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '4k', label: '4k' },
];

export const IMAGE_OUTPUT_FORMAT_OPTIONS: SelectOption[] = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WEBP' },
];

export const AUDIO_OUTPUT_FORMAT_OPTIONS: SelectOption[] = [
  { value: 'mp3_44100_128', label: 'MP3 44.1kHz 128kbps' },
  { value: 'mp3_44100_64', label: 'MP3 44.1kHz 64kbps' },
  { value: 'pcm_44100', label: 'PCM 44.1kHz' },
];

export const FALLBACK_MODEL_OPTIONS: ModelCatalog = {
  text: {
    gemini: [
      { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
      { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
      { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
      { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
      { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash-Lite Preview' },
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
    ],
    openai: [
      { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
      { value: 'gpt-4.1', label: 'GPT-4.1' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    ],
    huggingface: [
      { value: 'Qwen/Qwen3-4B-Instruct-2507', label: 'Qwen 3 4B Instruct 2507' },
      { value: 'Qwen/Qwen3-8B', label: 'Qwen 3 8B' },
      { value: 'meta-llama/Llama-3.1-8B-Instruct', label: 'Llama 3.1 8B Instruct' },
      { value: 'meta-llama/Llama-3.3-70B-Instruct', label: 'Llama 3.3 70B Instruct' },
      { value: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek R1' },
    ],
  },
  image: {
    gemini: [
      { value: 'gemini-3.1-flash-image', label: 'Gemini 3.1 Flash Image' },
      { value: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image Preview' },
      { value: 'gemini-3-pro-image', label: 'Gemini 3 Pro Image' },
      { value: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image Preview' },
      { value: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image' },
      { value: 'imagen-4.0-fast-generate-001', label: 'Vertex Imagen 4 Fast' },
      { value: 'imagen-4.0-generate-001', label: 'Vertex Imagen 4 Generate' },
      { value: 'imagen-4.0-ultra-generate-001', label: 'Vertex Imagen 4 Ultra' },
    ],
    openai: [
      { value: 'gpt-image-2', label: 'GPT Image 2' },
      { value: 'gpt-image-1', label: 'GPT Image 1' },
    ],
    atlas: [
      { value: 'black-forest-labs/flux-schnell', label: 'Atlas FLUX Schnell' },
      { value: 'black-forest-labs/flux-dev', label: 'Atlas FLUX Dev' },
      { value: 'black-forest-labs/flux-dev-lora', label: 'Atlas FLUX Dev LoRA' },
      { value: 'z-image/turbo', label: 'Atlas Z-Image Turbo' },
      { value: 'bytedance/seedream-v5.0-lite', label: 'Atlas Seedream v5.0 Lite' },
      { value: 'google/nano-banana-pro/text-to-image', label: 'Atlas Nano Banana Pro' },
      { value: 'black-forest-labs/flux-kontext-dev', label: 'Atlas FLUX Kontext Dev' },
      { value: 'bytedance/seedream-v5.0-lite/edit', label: 'Atlas Seedream Image-to-Image' },
      { value: 'atlascloud/qwen-image/edit', label: 'Atlas Qwen Image Edit' },
      { value: 'atlascloud/qwen-image/edit-2511', label: 'Atlas Qwen Image Edit 2511' },
      { value: 'fireredteam/firered-image-edit-1.0', label: 'Atlas FireRed Image Edit 1.0' },
      { value: 'gpt-image-2', label: 'GPT Image 2' },
      { value: 'gpt-image-1', label: 'GPT Image 1' },
    ],
    bfl: [
      { value: 'flux-2-klein-4b', label: 'FLUX.2 Klein 4B' },
      { value: 'flux-2-klein-9b', label: 'FLUX.2 Klein 9B' },
      { value: 'flux-2-pro', label: 'FLUX.2 Pro' },
      { value: 'flux-2-pro-preview', label: 'FLUX.2 Pro Preview' },
      { value: 'flux-2-flex', label: 'FLUX.2 Flex' },
      { value: 'flux-2-max', label: 'FLUX.2 Max' },
    ],
    stability: [
      { value: 'stable-image-core', label: 'Stable Image Core' },
      { value: 'stable-image-ultra', label: 'Stable Image Ultra' },
      { value: 'stable-image-edit-inpaint', label: 'Stable Image Edit: Inpaint' },
      { value: 'stable-image-edit-erase', label: 'Stable Image Edit: Erase' },
      { value: 'stable-image-edit-outpaint', label: 'Stable Image Edit: Outpaint' },
      { value: 'stable-image-edit-search-replace', label: 'Stable Image Edit: Search and Replace' },
      { value: 'stable-image-edit-search-recolor', label: 'Stable Image Edit: Search and Recolor' },
      { value: 'stable-image-edit-remove-background', label: 'Stable Image Edit: Remove Background' },
      { value: 'stable-image-edit-replace-background-relight', label: 'Stable Image Edit: Replace Background & Relight' },
    ],
    localOpen: [
      { value: 'Qwen/Qwen-Image-Edit', label: 'Qwen Image Edit' },
      { value: 'Qwen/Qwen-Image-Edit-2511', label: 'Qwen Image Edit 2511' },
      { value: 'black-forest-labs/FLUX.1-Kontext-dev', label: 'FLUX.1 Kontext Dev' },
    ],
    android: [
      { value: 'local-dream-active', label: 'Local Dream Active Model' },
    ],
    huggingface: [
      { value: 'black-forest-labs/FLUX.1-dev', label: 'FLUX.1 Dev' },
      { value: 'Tongyi-MAI/Z-Image-Turbo', label: 'Z-Image Turbo' },
      { value: 'Qwen/Qwen-Image', label: 'Qwen Image' },
      { value: 'black-forest-labs/FLUX.1-Kontext-dev', label: 'FLUX.1 Kontext Dev' },
      { value: 'stabilityai/stable-diffusion-3.5-large', label: 'Stable Diffusion 3.5 Large' },
      { value: 'stabilityai/stable-diffusion-xl-base-1.0', label: 'SDXL Base 1.0' },
    ],
  },
  video: {
    gemini: [
      { value: 'gemini-omni-flash-preview', label: 'Gemini Omni Flash Preview' },
      { value: 'veo-3.1-generate-001', label: 'Veo 3.1' },
      { value: 'veo-3.1-fast-generate-001', label: 'Veo 3.1 Fast' },
      { value: 'veo-3.0-generate-001', label: 'Veo 3' },
    ],
    huggingface: [
      { value: 'Lightricks/LTX-2.3', label: 'LTX 2.3' },
      { value: 'Wan-AI/Wan2.2-T2V-A14B', label: 'Wan 2.2 T2V A14B' },
      { value: 'Wan-AI/Wan2.2-TI2V-5B', label: 'Wan 2.2 TI2V 5B' },
      { value: 'tencent/HunyuanVideo', label: 'Hunyuan Video' },
      { value: 'genmo/mochi-1-preview', label: 'Mochi 1 Preview' },
      { value: 'Lightricks/LTX-Video', label: 'LTX Video' },
    ],
  },
  audio: {
    gemini: [
      { value: 'gemini-3.1-flash-tts-preview', label: 'Gemini 3.1 Flash TTS Preview' },
      { value: 'gemini-2.5-flash-preview-tts', label: 'Gemini 2.5 Flash Preview TTS' },
      { value: 'gemini-2.5-pro-preview-tts', label: 'Gemini 2.5 Pro Preview TTS' },
    ],
    elevenlabs: [
      { value: 'eleven_v3', label: 'Eleven v3' },
      { value: 'eleven_multilingual_v2', label: 'Eleven Multilingual v2' },
      { value: 'eleven_flash_v2_5', label: 'Eleven Flash v2.5' },
      { value: 'eleven_flash_v2', label: 'Eleven Flash v2' },
      { value: 'eleven_ttv_v3', label: 'Eleven TTV v3' },
      { value: 'eleven_turbo_v2_5', label: 'Eleven Turbo v2.5' },
      { value: 'eleven_multilingual_sts_v2', label: 'Eleven Multilingual STS v2' },
      { value: 'eleven_english_sts_v2', label: 'Eleven English STS v2' },
      { value: 'eleven_text_to_sound_v2', label: 'Eleven Text to Sound v2' },
    ],
    huggingface: [
      { value: 'hexgrad/Kokoro-82M', label: 'Kokoro 82M' },
      { value: 'ResembleAI/chatterbox', label: 'Chatterbox' },
      { value: 'coqui/XTTS-v2', label: 'XTTS v2' },
      { value: 'microsoft/VibeVoice-1.5B', label: 'VibeVoice 1.5B' },
      { value: 'suno/bark', label: 'Suno Bark' },
    ],
  },
};

export const FALLBACK_VOICE_OPTIONS: VoiceOption[] = [];

export function buildEmptyModelCatalog(): ModelCatalog {
  return {
    text: {
      gemini: [],
      openai: [],
      huggingface: [],
    },
  image: {
      gemini: [],
      openai: [],
      atlas: [],
      huggingface: [],
      bfl: [],
      stability: [],
      localOpen: [],
      android: [],
    },
    video: {
      gemini: [],
      huggingface: [],
    },
    audio: {
      gemini: [],
      elevenlabs: [],
      huggingface: [],
    },
  };
}

export function cloneModelCatalog(modelCatalog: ModelCatalog): ModelCatalog {
  return {
    text: {
      gemini: [...modelCatalog.text.gemini],
      openai: [...modelCatalog.text.openai],
      huggingface: [...modelCatalog.text.huggingface],
    },
    image: {
      gemini: [...modelCatalog.image.gemini],
      openai: [...modelCatalog.image.openai],
      atlas: [...modelCatalog.image.atlas],
      huggingface: [...modelCatalog.image.huggingface],
      bfl: [...modelCatalog.image.bfl],
      stability: [...modelCatalog.image.stability],
      localOpen: [...modelCatalog.image.localOpen],
      android: [...modelCatalog.image.android],
    },
    video: {
      gemini: [...modelCatalog.video.gemini],
      huggingface: [...modelCatalog.video.huggingface],
    },
    audio: {
      gemini: [...modelCatalog.audio.gemini],
      elevenlabs: [...modelCatalog.audio.elevenlabs],
      huggingface: [...modelCatalog.audio.huggingface],
    },
  };
}

export function getConfiguredProviders<TCapability extends Capability>(
  capability: TCapability,
  apiKeys: ApiKeys,
  providerSettings?: Partial<Pick<
    ProviderSettings,
    'backendProxyEnabled' | 'backendProxyBaseUrl' | 'geminiCredentialMode' | 'vertexProjectId' | 'localOpenImageEndpointUrl' | 'androidAcceleratorBaseUrl'
  >>,
): ProviderForCapability<TCapability>[] {
  if (providerSettings?.backendProxyEnabled && providerSettings.backendProxyBaseUrl?.trim()) {
    return CAPABILITY_PROVIDERS[capability].filter((provider) =>
      provider !== 'android' || Boolean(providerSettings.androidAcceleratorBaseUrl?.trim()),
    ) as ProviderForCapability<TCapability>[];
  }

  return CAPABILITY_PROVIDERS[capability].filter((provider) => {
    switch (provider) {
      case 'gemini':
        return Boolean(apiKeys.gemini.trim()) || (
          capability === 'image'
          && providerSettings?.geminiCredentialMode === 'vertex-adc'
          && Boolean(providerSettings.vertexProjectId?.trim())
        );
      case 'openai':
        return Boolean(apiKeys.openai.trim());
      case 'atlas':
        return Boolean(apiKeys.atlas?.trim());
      case 'huggingface':
        return Boolean(apiKeys.huggingface.trim());
      case 'bfl':
        return capability === 'image' && Boolean(apiKeys.bfl?.trim());
      case 'stability':
        return capability === 'image' && Boolean(apiKeys.stability?.trim());
      case 'localOpen':
        return capability === 'image' && Boolean(providerSettings?.localOpenImageEndpointUrl?.trim());
      case 'android':
        return capability === 'image' && Boolean(providerSettings?.androidAcceleratorBaseUrl?.trim());
      case 'elevenlabs':
        return Boolean(apiKeys.elevenlabs.trim());
      default:
        return false;
    }
  }) as ProviderForCapability<TCapability>[];
}

export function ensureOption(options: SelectOption[], value: string, label?: string): SelectOption[] {
  const trimmedValue = value.trim();

  if (!trimmedValue || options.some((option) => option.value === trimmedValue)) {
    return options;
  }

  return [{ value: trimmedValue, label: label ?? trimmedValue }, ...options];
}

export function ensureVoiceOption(options: VoiceOption[], value: string, label?: string): VoiceOption[] {
  const trimmedValue = value.trim();

  if (!trimmedValue || options.some((option) => option.value === trimmedValue)) {
    return options;
  }

  return [{ value: trimmedValue, label: label ?? trimmedValue }, ...options];
}

export function getModelOptions<TCapability extends Capability>(
  capability: TCapability,
  provider: ProviderForCapability<TCapability>,
  modelCatalog: ModelCatalog,
  fallbackValue?: string,
): SelectOption[] {
  const catalogOptions = modelCatalog[capability][provider];

  if (catalogOptions.length > 0) {
    return ensureOption(catalogOptions, fallbackValue ?? '');
  }

  return ensureOption(FALLBACK_MODEL_OPTIONS[capability][provider], fallbackValue ?? '');
}

export function getProviderLabel(provider: keyof typeof PROVIDER_LABELS): string {
  return PROVIDER_LABELS[provider];
}

export function getImageAspectRatioOptions(
  provider: ProviderForCapability<'image'>,
  modelId?: string,
): SelectOption[] {
  switch (provider) {
    case 'gemini':
      if (isVertexImagenModelId(modelId)) {
        return VERTEX_IMAGEN_IMAGE_ASPECT_RATIO_OPTIONS;
      }

      if (supportsGemini25FlashImageAspectRatios(modelId)) {
        return GEMINI_25_FLASH_IMAGE_ASPECT_RATIO_OPTIONS;
      }

      if (supportsGemini31FlashOrProImageAspectRatios(modelId)) {
        return GEMINI_IMAGE_ASPECT_RATIO_OPTIONS;
      }

      return GEMINI_IMAGE_ASPECT_RATIO_OPTIONS;
    case 'openai':
      return OPENAI_IMAGE_ASPECT_RATIO_OPTIONS;
    case 'atlas':
      return isAtlasNativeImageModelId(modelId) ? IMAGE_ASPECT_RATIO_OPTIONS : OPENAI_IMAGE_ASPECT_RATIO_OPTIONS;
    case 'huggingface':
      return HUGGING_FACE_IMAGE_ASPECT_RATIO_OPTIONS;
    case 'bfl':
    case 'localOpen':
    case 'android':
      return IMAGE_ASPECT_RATIO_OPTIONS;
    case 'stability':
      if ((modelId ?? '').includes('-edit-')) {
        return [];
      }
      return IMAGE_ASPECT_RATIO_OPTIONS;
  }
}

function isAtlasNativeImageModelId(modelId: string | undefined): boolean {
  const normalizedModelId = modelId?.trim().toLowerCase() ?? '';
  return normalizedModelId.includes('/') && !normalizedModelId.startsWith('openai/');
}

export function getSupportedImageAspectRatio(
  provider: ProviderForCapability<'image'>,
  modelId: string | undefined,
  value: string | undefined,
): AspectRatio {
  const options = getImageAspectRatioOptions(provider, modelId);
  const requested = getNodeAspectRatio(value);

  if (options.some((option) => option.value === requested)) {
    return requested;
  }

  return findNearestAspectRatio(requested, options);
}

export function mapAspectRatioToImageSize(aspectRatio: AspectRatio): '1024x1024' | '1536x1024' | '1024x1536' {
  switch (aspectRatio) {
    case '3:2':
    case '16:9':
      return '1536x1024';
    case '2:3':
    case '9:16':
      return '1024x1536';
    case '1:1':
      return '1024x1024';
    default:
      throw new Error(`OpenAI image generation does not support ${aspectRatio} output.`);
  }
}

export function mapAspectRatioToImageDimensions(aspectRatio: AspectRatio): { width: number; height: number } {
  switch (aspectRatio) {
    case '2:3':
      return { width: 848, height: 1264 };
    case '3:4':
      return { width: 896, height: 1200 };
    case '4:5':
      return { width: 928, height: 1152 };
    case '21:9':
      return { width: 1584, height: 672 };
    case '16:9':
      return { width: 1376, height: 768 };
    case '3:2':
      return { width: 1264, height: 848 };
    case '4:3':
      return { width: 1200, height: 896 };
    case '5:4':
      return { width: 1152, height: 928 };
    case '9:16':
      return { width: 768, height: 1376 };
    case '1:1':
    default:
      return { width: 1024, height: 1024 };
  }
}

export function getNodeAspectRatio(value: string | undefined): AspectRatio {
  if (isAspectRatio(value)) {
    return value;
  }

  return '1:1';
}

export function isAspectRatio(value: unknown): value is AspectRatio {
  return typeof value === 'string'
    && (
      value === '1:1'
      || value === '2:3'
      || value === '3:2'
      || value === '3:4'
      || value === '4:3'
      || value === '4:5'
      || value === '5:4'
      || value === '9:16'
      || value === '16:9'
      || value === '21:9'
    );
}

function supportsGemini25FlashImageAspectRatios(modelId: string | undefined): boolean {
  const normalized = (modelId ?? '').trim().toLowerCase();
  return normalized.includes('2.5-flash-image');
}

function supportsGemini31FlashOrProImageAspectRatios(modelId: string | undefined): boolean {
  const normalized = (modelId ?? '').trim().toLowerCase();
  return normalized.includes('3.1-flash-image') || normalized.includes('3-pro-image');
}

export function isVertexImagenModelId(modelId: string | undefined): boolean {
  return (modelId ?? '').trim().toLowerCase().startsWith('imagen-');
}

function findNearestAspectRatio(value: AspectRatio, options: SelectOption[]): AspectRatio {
  const target = getAspectRatioNumericValue(value);
  const candidates = options
    .map((option) => getNodeAspectRatio(option.value))
    .filter((option, index, list) => list.indexOf(option) === index);

  return candidates.reduce((nearest, candidate) => {
    const nearestDelta = Math.abs(getAspectRatioNumericValue(nearest) - target);
    const candidateDelta = Math.abs(getAspectRatioNumericValue(candidate) - target);
    return candidateDelta < nearestDelta ? candidate : nearest;
  }, candidates[0] ?? '1:1');
}

function getAspectRatioNumericValue(value: AspectRatio): number {
  const [width, height] = value.split(':').map((part) => Number(part));
  return width / height;
}

export function getVideoResolution(value: string | undefined): VideoResolution {
  if (value === '1080p' || value === '4k') {
    return value;
  }

  return '720p';
}

export function getImageOutputFormat(value: string | undefined): ImageOutputFormat {
  if (value === 'jpeg' || value === 'webp') {
    return value;
  }

  return 'png';
}

export function getAudioOutputFormat(value: string | undefined): AudioOutputFormat {
  if (value === 'mp3_44100_64' || value === 'pcm_44100') {
    return value;
  }

  return 'mp3_44100_128';
}

export function getVideoDurationOptions(hasInterpolationFrames: boolean): SelectOption[] {
  return hasInterpolationFrames
    ? VIDEO_DURATION_OPTIONS.filter((option) => option.value === '8')
    : VIDEO_DURATION_OPTIONS;
}

export function getVideoResolutionOptions(durationSeconds: number, hasExtensionVideo = false): SelectOption[] {
  if (hasExtensionVideo) {
    return VIDEO_RESOLUTION_OPTIONS.filter((option) => option.value === '720p');
  }

  return durationSeconds === 8
    ? VIDEO_RESOLUTION_OPTIONS
    : VIDEO_RESOLUTION_OPTIONS.filter((option) => option.value === '720p');
}
