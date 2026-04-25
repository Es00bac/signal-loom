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
  huggingface: 'Hugging Face',
  elevenlabs: 'ElevenLabs',
} as const;

export const CAPABILITY_PROVIDERS = {
  text: ['gemini', 'openai', 'huggingface'],
  image: ['gemini', 'openai', 'huggingface'],
  video: ['gemini', 'huggingface'],
  audio: ['gemini', 'elevenlabs', 'huggingface'],
} as const;

export const DEFAULT_MODELS: DefaultModelSettings = {
  text: {
    gemini: 'gemini-2.5-flash',
    openai: 'gpt-4.1-mini',
    huggingface: 'Qwen/Qwen3-4B-Instruct-2507',
  },
  image: {
    gemini: 'gemini-3-pro-image-preview',
    openai: 'gpt-image-1',
    huggingface: 'black-forest-labs/FLUX.1-dev',
  },
  video: {
    gemini: 'veo-3.1-generate-preview',
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
  elevenlabsVoiceId: '',
  renderBackendPreference: 'auto' as RenderBackendPreference,
  localNativeRenderUrl: 'http://127.0.0.1:41736',
  backendProxyEnabled: false,
  backendProxyBaseUrl: '',
} as const;

export const RENDER_BACKEND_OPTIONS: SelectOption[] = [
  { value: 'auto', label: 'Auto (prefer native local render when available)' },
  { value: 'browser', label: 'Browser FFmpeg (maximum compatibility)' },
  { value: 'native-cpu', label: 'Native FFmpeg CPU (multithreaded)' },
  { value: 'native-amd-vaapi', label: 'Native FFmpeg AMD VAAPI' },
];

export const DEFAULT_EXECUTION_CONFIG: ExecutionConfig = {
  aspectRatio: '1:1',
  steps: 30,
  durationSeconds: 6,
  videoResolution: '720p',
  imageOutputFormat: 'png',
  audioOutputFormat: 'mp3_44100_128',
};

export const ASPECT_RATIO_OPTIONS: SelectOption[] = [
  { value: '1:1', label: '1:1 Square' },
  { value: '16:9', label: '16:9 Landscape' },
  { value: '9:16', label: '9:16 Portrait' },
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
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
      { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
      { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview' },
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
      { value: 'gemini-3.1-flash-image-preview', label: 'Gemini 3.1 Flash Image Preview' },
      { value: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image Preview' },
      { value: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image' },
    ],
    openai: [{ value: 'gpt-image-1', label: 'GPT Image 1' }],
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
      { value: 'veo-3.1-generate-preview', label: 'Veo 3.1' },
      { value: 'veo-3.1-fast-generate-preview', label: 'Veo 3.1 Fast' },
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
      huggingface: [],
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
      huggingface: [...modelCatalog.image.huggingface],
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
  providerSettings?: Pick<ProviderSettings, 'backendProxyEnabled' | 'backendProxyBaseUrl'>,
): ProviderForCapability<TCapability>[] {
  if (providerSettings?.backendProxyEnabled && providerSettings.backendProxyBaseUrl.trim()) {
    return [...CAPABILITY_PROVIDERS[capability]] as ProviderForCapability<TCapability>[];
  }

  return CAPABILITY_PROVIDERS[capability].filter((provider) => {
    switch (provider) {
      case 'gemini':
        return Boolean(apiKeys.gemini.trim());
      case 'openai':
        return Boolean(apiKeys.openai.trim());
      case 'huggingface':
        return Boolean(apiKeys.huggingface.trim());
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

export function mapAspectRatioToImageSize(aspectRatio: AspectRatio): '1024x1024' | '1536x1024' | '1024x1536' {
  switch (aspectRatio) {
    case '16:9':
      return '1536x1024';
    case '9:16':
      return '1024x1536';
    case '1:1':
    default:
      return '1024x1024';
  }
}

export function mapAspectRatioToImageDimensions(aspectRatio: AspectRatio): { width: number; height: number } {
  switch (aspectRatio) {
    case '16:9':
      return { width: 1536, height: 1024 };
    case '9:16':
      return { width: 1024, height: 1536 };
    case '1:1':
    default:
      return { width: 1024, height: 1024 };
  }
}

export function getNodeAspectRatio(value: string | undefined): AspectRatio {
  if (value === '16:9' || value === '9:16') {
    return value;
  }

  return '1:1';
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
