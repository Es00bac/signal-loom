import type {
  CompositionTargetHandle,
  FlowNodeType,
  ImageTargetHandle,
  VideoTargetHandle,
} from '../types/flow';

export interface NodeActionTemplate {
  id: string;
  label: string;
  targetType?: FlowNodeType;
  targetHandle?: VideoTargetHandle | CompositionTargetHandle | ImageTargetHandle;
  disabled?: boolean;
}

export function getCompatibleNodeActions(nodeType: FlowNodeType): NodeActionTemplate[] {
  switch (nodeType) {
    case 'imageGen':
      return [
        {
          id: 'edit-image',
          label: 'Edit image',
          targetType: 'imageGen',
          targetHandle: 'image-edit-source',
        },
        {
          id: 'reference-image',
          label: 'Reference image',
          targetType: 'imageGen',
          targetHandle: 'image-reference-1',
        },
        {
          id: 'describe-image',
          label: 'Describe with text',
          targetType: 'textNode',
        },
        {
          id: 'animate-to-video',
          label: 'Animate to video',
          targetType: 'videoGen',
          targetHandle: 'video-start-frame',
        },
        {
          id: 'guide-video-style',
          label: 'Guide video',
          targetType: 'videoGen',
          targetHandle: 'video-reference-1',
        },
        {
          id: 'mix-with-audio',
          label: 'Mix with audio',
          targetType: 'composition',
          targetHandle: 'composition-video',
        },
        {
          id: 'collect-in-bin',
          label: 'Collect in source bin',
          targetType: 'sourceBin',
        },
      ];
    case 'videoGen':
      return [
        { id: 'upscale', label: 'Upscale', disabled: true },
        { id: 'edit-video', label: 'Edit video', disabled: true },
        {
          id: 'extract-frame',
          label: 'Extract frame',
          targetType: 'imageGen',
        },
        {
          id: 'mix-with-audio',
          label: 'Mix with audio',
          targetType: 'composition',
          targetHandle: 'composition-video',
        },
        {
          id: 'extend-video',
          label: 'Extend video',
          targetType: 'videoGen',
          targetHandle: 'video-source-video',
        },
        {
          id: 'collect-in-bin',
          label: 'Collect in source bin',
          targetType: 'sourceBin',
        },
        { id: 'lipsync-generation', label: 'Lipsync generation', disabled: true },
      ];
    case 'audioGen':
      return [
        {
          id: 'mix-with-video',
          label: 'Mix with video',
          targetType: 'composition',
          targetHandle: 'composition-audio-1',
        },
        {
          id: 'collect-in-bin',
          label: 'Collect in source bin',
          targetType: 'sourceBin',
        },
        { id: 'lipsync-generation', label: 'Lipsync generation', disabled: true },
      ];
    case 'textNode':
      return [
        {
          id: 'generate-image',
          label: 'Generate image',
          targetType: 'imageGen',
        },
        {
          id: 'generate-video',
          label: 'Generate video',
          targetType: 'videoGen',
          targetHandle: 'video-prompt',
        },
        {
          id: 'generate-audio',
          label: 'Generate audio',
          targetType: 'audioGen',
        },
        {
          id: 'collect-in-bin',
          label: 'Collect in source bin',
          targetType: 'sourceBin',
        },
      ];
    case 'composition':
      return [
        {
          id: 'collect-in-bin',
          label: 'Collect in source bin',
          targetType: 'sourceBin',
        },
      ];
    default:
      return [];
  }
}
