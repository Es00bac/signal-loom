import { describe, expect, it } from 'vitest';
import {
  buildPaperLinkedEditReturnItem,
  describeLinkedEditTarget,
  getLinkedEditTargetWorkspace,
} from './imageLinkedEdit';

describe('linked image edits', () => {
  it('maps linked-edit origins to their workspaces and labels', () => {
    const paper = { kind: 'paper-frame', pageId: 'p1', frameId: 'f1', sourceLabel: 'panel.png' } as const;
    const slimg = { kind: 'slimg-node', filePath: '/tmp/x.slimg' } as const;

    expect(getLinkedEditTargetWorkspace(paper)).toBe('paper');
    expect(getLinkedEditTargetWorkspace(slimg)).toBe('flow');
    expect(getLinkedEditTargetWorkspace(undefined)).toBeUndefined();
    expect(describeLinkedEditTarget(paper)).toBe('Paper');
    expect(describeLinkedEditTarget(slimg)).toBe('Flow');
  });

  it('builds the returning Paper asset from the document and its origin frame', () => {
    const item = buildPaperLinkedEditReturnItem(
      { width: 800, height: 600 },
      { kind: 'paper-frame', pageId: 'page-2', frameId: 'frame-7', sourceLabel: 'ENV E02 · Tinaja town.png' },
      'data:image/png;base64,AAAA',
      1234,
    );

    expect(item).toEqual({
      label: 'ENV E02 · Tinaja town (edited).png',
      kind: 'image',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,AAAA',
      pixelWidth: 800,
      pixelHeight: 600,
      isGenerated: false,
      sourceKey: 'paper-linked-edit:frame-7:1234',
      originNodeId: 'paper-linked-edit',
    });
  });

  it('falls back to a generic label when the source label is empty', () => {
    const item = buildPaperLinkedEditReturnItem(
      { width: 10, height: 10 },
      { kind: 'paper-frame', pageId: 'p', frameId: 'f', sourceLabel: '' },
      'data:image/png;base64,BBBB',
      1,
    );
    expect(item.label).toBe('Paper image (edited).png');
  });
});
