import { describe, expect, it } from 'vitest';
import { filterAudioModelOptions } from './AudioNode';
import { FALLBACK_MODEL_OPTIONS } from '../../lib/providerCatalog';

describe('AudioNode ElevenLabs model filtering', () => {
  const options = FALLBACK_MODEL_OPTIONS.audio.elevenlabs;

  it('never offers the text-to-voice design model (eleven_ttv_v3) in Speech mode', () => {
    // `_ttv_` models are voice-DESIGN models; /v1/text-to-speech rejects them, so
    // listing them in Speech mode guaranteed a failing run.
    const speech = filterAudioModelOptions('elevenlabs', 'speech', options).map((option) => option.value);
    expect(speech.length).toBeGreaterThan(0);
    expect(speech).not.toContain('eleven_ttv_v3');
    expect(speech.some((value) => value.includes('_sts_'))).toBe(false);
    expect(speech.some((value) => value.includes('sound'))).toBe(false);
  });

  it('keeps SFX mode on sound models and Voice mode on STS models', () => {
    const sfx = filterAudioModelOptions('elevenlabs', 'soundEffect', options).map((option) => option.value);
    const voice = filterAudioModelOptions('elevenlabs', 'voiceChange', options).map((option) => option.value);
    expect(sfx).toEqual(['eleven_text_to_sound_v2']);
    expect(voice).toEqual(['eleven_multilingual_sts_v2', 'eleven_english_sts_v2']);
  });
});
