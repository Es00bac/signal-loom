import type { AppNode, FlowNodeType } from '../types/flow';

export interface NodeBookmark {
  id: string;
  title: string;
  type: FlowNodeType;
}

export function resolveNodeDisplayTitle(defaultTitle: string, customTitle: unknown): string {
  return typeof customTitle === 'string' && customTitle.trim()
    ? customTitle.trim()
    : defaultTitle;
}

export function collectNodeBookmarks(nodes: AppNode[]): NodeBookmark[] {
  return nodes.flatMap((node) => {
    const title = typeof node.data.customTitle === 'string' ? node.data.customTitle.trim() : '';

    return title
      ? [{
          id: node.id,
          title,
          type: node.type,
        }]
      : [];
  });
}

export function getNodeTypeLabel(type: FlowNodeType): string {
  switch (type) {
    case 'textNode':
      return 'Text';
    case 'imageGen':
      return 'Image';
    case 'videoGen':
      return 'Video';
    case 'audioGen':
      return 'Audio';
    case 'settings':
      return 'Config';
    case 'composition':
      return 'Composition';
    case 'sourceBin':
      return 'Source Bin';
    case 'virtual':
      return 'Virtual';
  }
}
