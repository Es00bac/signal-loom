import type { Node, NodeProps } from '@xyflow/react';

export type FlowNodeType =
  | 'textNode'
  | 'imageGen'
  | 'videoGen'
  | 'audioGen'
  | 'settings'
  | 'composition'
  | 'sourceBin'
  | 'virtual';

export type TextNodeMode = 'prompt' | 'generate';
export type MediaNodeMode = 'generate' | 'import';
export type TextProvider = 'gemini' | 'openai' | 'huggingface';
export type ImageProvider = 'gemini' | 'openai' | 'huggingface';
export type VideoProvider = 'gemini' | 'huggingface';
export type AudioProvider = 'gemini' | 'elevenlabs' | 'huggingface';
export type AudioGenerationMode = 'speech' | 'soundEffect' | 'voiceChange';
export type AspectRatio = '1:1' | '16:9' | '9:16';
export type VideoResolution = '720p' | '1080p' | '4k';
export type ImageOutputFormat = 'png' | 'jpeg' | 'webp';
export type AudioOutputFormat = 'mp3_44100_128' | 'mp3_44100_64' | 'pcm_44100';
export type ResultType = 'text' | 'image' | 'video' | 'audio';
export type SerializableNodeValue = string | number | boolean | null | undefined;
export type VideoFrameSelection = 'first' | 'last';
export type VideoReferenceType = 'asset' | 'style';
export type RenderBackendPreference = 'auto' | 'browser' | 'native-cpu' | 'native-amd-vaapi';
export type ImageTargetHandle =
  | 'image-edit-source'
  | 'image-reference-1'
  | 'image-reference-2'
  | 'image-reference-3';
export type VideoTargetHandle =
  | 'video-prompt'
  | 'video-start-frame'
  | 'video-end-frame'
  | 'video-reference-1'
  | 'video-reference-2'
  | 'video-reference-3'
  | 'video-source-video';
export type CompositionTargetHandle =
  | 'composition-video'
  | 'composition-audio-1'
  | 'composition-audio-2'
  | 'composition-audio-3'
  | 'composition-audio-4';
export type Capability = 'text' | 'image' | 'video' | 'audio';
export type UsageTelemetrySource = 'estimate' | 'actual';
export type UsageTelemetryConfidence = 'measured' | 'heuristic' | 'fixed' | 'unknown';
export type WorkspaceView = 'flow' | 'editor';
export type EditorSourceKind = 'text' | 'image' | 'video' | 'audio' | 'composition';
export type EditorVisualSourceKind = 'text' | 'shape' | 'image' | 'video' | 'composition';
export type VisualClipTransition = 'none' | 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down';
export type EditorVisualFitMode = 'contain' | 'cover' | 'stretch';
export type TextClipEffect = 'none' | 'shadow' | 'glow' | 'outline';
export type EditorAssetKind = 'text' | 'shape' | 'image';
export type EditorShapeKind = 'rectangle';
export type EditorClipFilterKind = 'brightness' | 'contrast' | 'saturation' | 'blur' | 'grayscale';
export type EditorStageObjectKind = 'text' | 'rectangle';
export type EditorStageBlendMode =
  | 'normal'
  | 'screen'
  | 'multiply'
  | 'overlay'
  | 'lighten'
  | 'darken'
  | 'color-dodge'
  | 'color-burn';

export interface TimelineAutomationPoint {
  timePercent: number;
  valuePercent: number;
}

export interface EditorVisualKeyframe {
  timePercent: number;
  positionX: number;
  positionY: number;
  scalePercent: number;
  rotationDeg: number;
  opacityPercent: number;
}

export interface EditorAudioKeyframe {
  timePercent: number;
  volumePercent: number;
}

export interface EditorClipFilter {
  id: string;
  kind: EditorClipFilterKind;
  amount: number;
  enabled: boolean;
}

export interface EditorTextDefaults {
  text: string;
  fontFamily: string;
  fontSizePx: number;
  color: string;
  textEffect: TextClipEffect;
  textBackgroundOpacityPercent: number;
}

export interface EditorShapeDefaults {
  shape: EditorShapeKind;
  fillColor: string;
  borderColor: string;
  borderWidth: number;
  cornerRadius: number;
}

export interface EditorAsset {
  id: string;
  kind: EditorAssetKind;
  label: string;
  createdAt: number;
  updatedAt: number;
  imageSourceId?: string;
  textDefaults?: EditorTextDefaults;
  shapeDefaults?: EditorShapeDefaults;
}

export interface EditorVisualClip {
  id: string;
  sourceNodeId: string;
  sourceKind: EditorVisualSourceKind;
  trackIndex: number;
  startMs: number;
  sourceInMs: number;
  sourceOutMs?: number;
  durationSeconds?: number;
  trimStartMs: number;
  trimEndMs: number;
  playbackRate: number;
  reversePlayback: boolean;
  fitMode: EditorVisualFitMode;
  scalePercent: number;
  scaleMotionEnabled: boolean;
  endScalePercent: number;
  opacityPercent: number;
  opacityAutomationPoints?: TimelineAutomationPoint[];
  keyframes?: EditorVisualKeyframe[];
  rotationDeg: number;
  rotationMotionEnabled: boolean;
  endRotationDeg: number;
  flipHorizontal: boolean;
  flipVertical: boolean;
  positionX: number;
  positionY: number;
  motionEnabled: boolean;
  endPositionX: number;
  endPositionY: number;
  cropLeftPercent: number;
  cropRightPercent: number;
  cropTopPercent: number;
  cropBottomPercent: number;
  cropPanXPercent: number;
  cropPanYPercent: number;
  cropRotationDeg: number;
  filterStack: EditorClipFilter[];
  blendMode?: EditorStageBlendMode;
  transitionIn: VisualClipTransition;
  transitionOut: VisualClipTransition;
  transitionDurationMs: number;
  textContent?: string;
  textFontFamily: string;
  textSizePx: number;
  textColor: string;
  textEffect: TextClipEffect;
  textBackgroundOpacityPercent: number;
  shapeFillColor?: string;
  shapeBorderColor?: string;
  shapeBorderWidth?: number;
  shapeCornerRadius?: number;
}

export interface EditorAudioClip {
  id: string;
  sourceNodeId: string;
  offsetMs: number;
  trackIndex: number;
  volumePercent: number;
  volumeAutomationPoints?: TimelineAutomationPoint[];
  volumeKeyframes?: EditorAudioKeyframe[];
  enabled: boolean;
}

interface EditorStageObjectBase {
  id: string;
  kind: EditorStageObjectKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
  opacityPercent: number;
  blendMode: EditorStageBlendMode;
}

export interface EditorTextStageObject extends EditorStageObjectBase {
  kind: 'text';
  text: string;
  fontFamily: string;
  fontSizePx: number;
  color: string;
}

export interface EditorRectangleStageObject extends EditorStageObjectBase {
  kind: 'rectangle';
  fillColor: string;
  borderColor: string;
  borderWidth: number;
  cornerRadius: number;
}

export type EditorStageObject = EditorTextStageObject | EditorRectangleStageObject;

export interface UsageTelemetry {
  source: UsageTelemetrySource;
  confidence: UsageTelemetryConfidence;
  provider?: string;
  modelId?: string;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  characters?: number;
  durationSeconds?: number;
  imageCount?: number;
  notes?: string[];
}

export interface NodeResultAttempt {
  id: string;
  result: string;
  resultType: ResultType;
  statusMessage: string;
  createdAt: string;
  usage?: UsageTelemetry;
}

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

export interface VoiceOption extends SelectOption {
  previewUrl?: string;
  category?: string;
}

export interface CapabilityProviderMap {
  text: TextProvider;
  image: ImageProvider;
  video: VideoProvider;
  audio: AudioProvider;
}

export type ProviderForCapability<TCapability extends Capability> = CapabilityProviderMap[TCapability];

export type ModelCatalog = {
  [TCapability in Capability]: Record<ProviderForCapability<TCapability>, SelectOption[]>;
};

export interface ApiKeys {
  openai: string;
  gemini: string;
  huggingface: string;
  elevenlabs: string;
}

export interface ProviderSettings {
  openaiBaseUrl: string;
  elevenlabsVoiceId: string;
  renderBackendPreference: RenderBackendPreference;
  localNativeRenderUrl: string;
  backendProxyEnabled: boolean;
  backendProxyBaseUrl: string;
}

export interface DefaultModelSettings {
  text: Record<TextProvider, string>;
  image: Record<ImageProvider, string>;
  video: Record<VideoProvider, string>;
  audio: Record<AudioProvider, string>;
}

export interface RuntimeSettingsSnapshot {
  apiKeys: ApiKeys;
  defaultModels: DefaultModelSettings;
  providerSettings: ProviderSettings;
}

export interface ExecutionConfig {
  aspectRatio: AspectRatio;
  steps: number;
  durationSeconds: number;
  videoResolution: VideoResolution;
  imageOutputFormat: ImageOutputFormat;
  audioOutputFormat: AudioOutputFormat;
}

export interface NodeData {
  [key: string]: unknown;
  onChange?: (key: string, value: SerializableNodeValue) => void;
  onRun?: () => void;
  onSelectAttempt?: (attemptId: string) => void;
  isRunning?: boolean;
  error?: string;
  statusMessage?: string;
  collapsed?: boolean;
  customTitle?: string;
  result?: string;
  resultType?: ResultType;
  resultHistory?: NodeResultAttempt[];
  selectedResultId?: string;
  usage?: UsageTelemetry;
  prompt?: string;
  systemPrompt?: string;
  mode?: TextNodeMode;
  mediaMode?: MediaNodeMode;
  provider?: TextProvider | ImageProvider | VideoProvider | AudioProvider;
  modelId?: string;
  aspectRatio?: AspectRatio;
  steps?: number;
  durationSeconds?: number;
  videoResolution?: VideoResolution;
  imageOutputFormat?: ImageOutputFormat;
  audioOutputFormat?: AudioOutputFormat;
  voiceId?: string;
  geminiVoiceName?: string;
  audioStyleDescription?: string;
  audioGenerationMode?: AudioGenerationMode;
  audioSeed?: number;
  audioLoop?: boolean;
  audioDurationSeconds?: number;
  audioPromptInfluence?: number;
  audioRemoveBackgroundNoise?: boolean;
  videoSeed?: number;
  videoReference1Type?: VideoReferenceType;
  videoReference2Type?: VideoReferenceType;
  videoReference3Type?: VideoReferenceType;
  sourceAssetId?: string;
  sourceAssetUrl?: string;
  sourceAssetName?: string;
  sourceAssetMimeType?: string;
  textVisionSourceItemId?: string;
  videoFrameSelection?: VideoFrameSelection;
  compositionAudioTrackCount?: number;
  compositionTimelineSeconds?: number;
  compositionUseVideoAudio?: boolean;
  compositionVideoAudioVolume?: number;
  compositionAudio1OffsetMs?: number;
  compositionAudio2OffsetMs?: number;
  compositionAudio3OffsetMs?: number;
  compositionAudio4OffsetMs?: number;
  compositionAudio1Volume?: number;
  compositionAudio2Volume?: number;
  compositionAudio3Volume?: number;
  compositionAudio4Volume?: number;
  compositionAudio1Enabled?: boolean;
  compositionAudio2Enabled?: boolean;
  compositionAudio3Enabled?: boolean;
  compositionAudio4Enabled?: boolean;
  editorVisualClips?: EditorVisualClip[];
  editorAudioClips?: EditorAudioClip[];
  editorAudioTrackVolumes?: number[];
  editorAssets?: EditorAsset[];
  editorStageObjects?: EditorStageObject[];
  editorTimelineSnapPoints?: number[];
}

export type AppNode = Node<NodeData, FlowNodeType>;
export type AppNodeProps = NodeProps<AppNode>;
export type PersistedNodeData = Omit<
  NodeData,
  | 'onChange'
  | 'onRun'
  | 'onSelectAttempt'
  | 'isRunning'
  | 'error'
  | 'statusMessage'
  | 'result'
  | 'resultType'
  | 'resultHistory'
  | 'selectedResultId'
  | 'usage'
>;
