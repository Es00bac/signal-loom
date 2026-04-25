import { create } from 'zustand';
import {
  buildEmptyModelCatalog,
  cloneModelCatalog,
  FALLBACK_MODEL_OPTIONS,
  FALLBACK_VOICE_OPTIONS,
} from '../lib/providerCatalog';
import { normalizeGeminiVideoModelId } from '../lib/videoModelSupport';
import type {
  ModelCatalog,
  RuntimeSettingsSnapshot,
  SelectOption,
  VoiceOption,
} from '../types/flow';

interface CatalogState {
  modelCatalog: ModelCatalog;
  elevenLabsVoices: VoiceOption[];
  isRefreshing: boolean;
  refreshError?: string;
  lastRefreshedAt?: string;
  refreshCatalogs: (settings: RuntimeSettingsSnapshot) => Promise<void>;
}

interface GeminiModelRecord {
  name?: string;
  displayName?: string;
  description?: string;
  supportedGenerationMethods?: string[];
}

interface OpenAIModelRecord {
  id?: string;
}

interface ElevenLabsModelRecord {
  model_id?: string;
  modelId?: string;
  name?: string;
  description?: string;
  can_do_text_to_speech?: boolean;
  canDoTextToSpeech?: boolean;
  can_do_voice_conversion?: boolean;
  canDoVoiceConversion?: boolean;
  can_do_text_to_sound_effects?: boolean;
  canDoTextToSoundEffects?: boolean;
}

interface ElevenLabsVoiceRecord {
  voice_id?: string;
  voiceId?: string;
  name?: string;
  category?: string;
  preview_url?: string;
  previewUrl?: string;
}

function dedupeOptions(options: SelectOption[]): SelectOption[] {
  const seen = new Set<string>();
  const deduped: SelectOption[] = [];

  for (const option of options) {
    if (seen.has(option.value)) {
      continue;
    }

    seen.add(option.value);
    deduped.push(option);
  }

  return deduped;
}

function dedupeVoices(options: VoiceOption[]): VoiceOption[] {
  const seen = new Set<string>();
  const deduped: VoiceOption[] = [];

  for (const option of options) {
    if (seen.has(option.value)) {
      continue;
    }

    seen.add(option.value);
    deduped.push(option);
  }

  return deduped;
}

async function fetchGeminiModels(apiKey: string): Promise<ModelCatalog> {
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
    headers: {
      'x-goog-api-key': apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Gemini model discovery failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as { models?: GeminiModelRecord[] };
  const catalog = buildEmptyModelCatalog();

  for (const model of payload.models ?? []) {
    const modelName = model.name?.replace(/^models\//, '').trim();

    if (!modelName) {
      continue;
    }

    const lowerName = modelName.toLowerCase();
    const normalizedModelName = lowerName.startsWith('veo-')
      ? normalizeGeminiVideoModelId(modelName)
      : modelName;
    const option: SelectOption = {
      value: normalizedModelName,
      label: model.displayName?.trim() || normalizedModelName,
      description: model.description?.trim(),
    };

    if (lowerName.startsWith('veo-')) {
      catalog.video.gemini.push(option);
      continue;
    }

    if (lowerName.includes('image') || lowerName.startsWith('imagen-')) {
      catalog.image.gemini.push(option);
      continue;
    }

    if (lowerName.startsWith('gemini-')) {
      if (lowerName.includes('tts')) {
        catalog.audio.gemini.push(option);
        continue;
      }

      catalog.text.gemini.push(option);
    }
  }

  catalog.text.gemini = dedupeOptions(catalog.text.gemini);
  catalog.image.gemini = dedupeOptions(catalog.image.gemini);
  catalog.video.gemini = dedupeOptions(catalog.video.gemini);
  catalog.audio.gemini = dedupeOptions(catalog.audio.gemini);

  return catalog;
}

async function fetchOpenAIModels(apiKey: string, baseUrl: string): Promise<ModelCatalog> {
  const normalizedBaseUrl = baseUrl.trim() || 'https://api.openai.com/v1';
  const response = await fetch(`${normalizedBaseUrl.replace(/\/$/, '')}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`OpenAI model discovery failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as { data?: OpenAIModelRecord[] };
  const textOptions: SelectOption[] = [];
  const imageOptions: SelectOption[] = [];

  for (const model of payload.data ?? []) {
    const modelId = model.id?.trim();

    if (!modelId) {
      continue;
    }

    const option: SelectOption = {
      value: modelId,
      label: modelId,
    };
    const lowerId = modelId.toLowerCase();

    if (lowerId.includes('image')) {
      imageOptions.push(option);
      continue;
    }

    if (
      lowerId.includes('embedding') ||
      lowerId.includes('moderation') ||
      lowerId.includes('transcribe') ||
      lowerId.includes('whisper') ||
      lowerId.includes('tts')
    ) {
      continue;
    }

    textOptions.push(option);
  }

  const catalog = buildEmptyModelCatalog();
  catalog.text.openai = dedupeOptions(textOptions);
  catalog.image.openai = dedupeOptions(imageOptions);

  return catalog;
}

async function fetchElevenLabsModels(apiKey: string): Promise<SelectOption[]> {
  const response = await fetch('https://api.elevenlabs.io/v1/models', {
    headers: {
      'xi-api-key': apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs model discovery failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as ElevenLabsModelRecord[] | { models?: ElevenLabsModelRecord[] };
  const models = Array.isArray(payload) ? payload : payload.models ?? [];

  return dedupeOptions(
    models
      .filter((model) => {
        const supportsTts = model.can_do_text_to_speech ?? model.canDoTextToSpeech;
        const supportsVoiceConversion = model.can_do_voice_conversion ?? model.canDoVoiceConversion;
        const supportsSoundEffects = model.can_do_text_to_sound_effects ?? model.canDoTextToSoundEffects;

        if (typeof supportsTts === 'boolean') {
          return supportsTts || Boolean(supportsVoiceConversion) || Boolean(supportsSoundEffects);
        }

        const modelId = model.model_id ?? model.modelId ?? '';
        return modelId.startsWith('eleven_');
      })
      .map((model) => ({
        value: (model.model_id ?? model.modelId ?? '').trim(),
        label: model.name?.trim() || (model.model_id ?? model.modelId ?? '').trim(),
        description: model.description?.trim(),
      }))
      .filter((option) => option.value),
  );
}

async function fetchElevenLabsVoices(apiKey: string): Promise<VoiceOption[]> {
  const response = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: {
      'xi-api-key': apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs voice discovery failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as { voices?: ElevenLabsVoiceRecord[] };

  return dedupeVoices(
    (payload.voices ?? [])
      .map((voice) => ({
        value: (voice.voice_id ?? voice.voiceId ?? '').trim(),
        label: voice.name?.trim() || (voice.voice_id ?? voice.voiceId ?? '').trim(),
        category: voice.category?.trim(),
        previewUrl: voice.preview_url ?? voice.previewUrl,
      }))
      .filter((option) => option.value)
      .sort((left, right) => left.label.localeCompare(right.label)),
  );
}

function mergeCatalog(target: ModelCatalog, partial: Partial<ModelCatalog>): ModelCatalog {
  const merged = cloneModelCatalog(target);

  if (partial.text?.gemini) {
    merged.text.gemini = partial.text.gemini;
  }

  if (partial.text?.openai) {
    merged.text.openai = partial.text.openai;
  }

  if (partial.text?.huggingface) {
    merged.text.huggingface = partial.text.huggingface;
  }

  if (partial.image?.gemini) {
    merged.image.gemini = partial.image.gemini;
  }

  if (partial.image?.openai) {
    merged.image.openai = partial.image.openai;
  }

  if (partial.image?.huggingface) {
    merged.image.huggingface = partial.image.huggingface;
  }

  if (partial.video?.gemini) {
    merged.video.gemini = partial.video.gemini;
  }

  if (partial.video?.huggingface) {
    merged.video.huggingface = partial.video.huggingface;
  }

  if (partial.audio?.gemini) {
    merged.audio.gemini = partial.audio.gemini;
  }

  if (partial.audio?.elevenlabs) {
    merged.audio.elevenlabs = partial.audio.elevenlabs;
  }

  if (partial.audio?.huggingface) {
    merged.audio.huggingface = partial.audio.huggingface;
  }

  return merged;
}

export const useCatalogStore = create<CatalogState>()((set) => ({
  modelCatalog: cloneModelCatalog(FALLBACK_MODEL_OPTIONS),
  elevenLabsVoices: [...FALLBACK_VOICE_OPTIONS],
  isRefreshing: false,
  refreshError: undefined,
  lastRefreshedAt: undefined,
  refreshCatalogs: async (settings) => {
    const nextCatalog = cloneModelCatalog(FALLBACK_MODEL_OPTIONS);
    let nextVoices = [...FALLBACK_VOICE_OPTIONS];
    const errors: string[] = [];

    set({ isRefreshing: true, refreshError: undefined });

    if (settings.apiKeys.gemini.trim()) {
      try {
        const partial = await fetchGeminiModels(settings.apiKeys.gemini.trim());
        Object.assign(nextCatalog, mergeCatalog(nextCatalog, partial));
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Gemini catalog refresh failed.');
      }
    }

    if (settings.apiKeys.openai.trim()) {
      try {
        const partial = await fetchOpenAIModels(
          settings.apiKeys.openai.trim(),
          settings.providerSettings.openaiBaseUrl,
        );
        Object.assign(nextCatalog, mergeCatalog(nextCatalog, partial));
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'OpenAI catalog refresh failed.');
      }
    }

    if (settings.apiKeys.elevenlabs.trim()) {
      try {
        nextCatalog.audio.elevenlabs = await fetchElevenLabsModels(settings.apiKeys.elevenlabs.trim());
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'ElevenLabs model catalog refresh failed.');
      }

      try {
        nextVoices = await fetchElevenLabsVoices(settings.apiKeys.elevenlabs.trim());
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'ElevenLabs voice catalog refresh failed.');
      }
    }

    set({
      modelCatalog: nextCatalog,
      elevenLabsVoices: nextVoices,
      isRefreshing: false,
      refreshError: errors.length > 0 ? errors.join(' ') : undefined,
      lastRefreshedAt: new Date().toISOString(),
    });
  },
}));
