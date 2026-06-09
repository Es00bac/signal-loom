import type { ImageLayer } from '../../types/imageEditor';

export interface ImageLayerWorkflowBadge {
  id: string;
  label: string;
  description: string;
}

export function getImageLayerWorkflowBadges(layer: ImageLayer): ImageLayerWorkflowBadge[] {
  const badges: ImageLayerWorkflowBadge[] = [];
  if (layer.type === 'text' || layer.metadata?.editableText) {
    badges.push({
      id: 'editable-text',
      label: 'TXT',
      description: 'Text content and style can be edited from the selected layer controls.',
    });
  }
  if (layer.metadata?.smartLinkedSourceId) {
    badges.push({
      id: 'smart-linked-source',
      label: 'SRC',
      description: `Can update from Source Bin asset${layer.metadata.sourceLabel ? `: ${layer.metadata.sourceLabel}` : ''}.`,
    });
  }
  return badges;
}
