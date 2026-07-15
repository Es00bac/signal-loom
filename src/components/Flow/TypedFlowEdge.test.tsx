import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { EdgeProps } from '@xyflow/react';
import {
  getFlowEdgePresentation,
  type FlowEdgeContractData,
} from './flowEdgePresentation';
import { TypedFlowEdge } from './TypedFlowEdge';

vi.mock('@xyflow/react', () => ({
  BaseEdge: ({ label, markerEnd, style, ...props }: Record<string, unknown>) => (
    <path
      {...props}
      data-edge-label={typeof label === 'string' ? label : undefined}
      data-testid="base-edge"
      markerEnd={markerEnd as string}
      style={style as React.CSSProperties}
    />
  ),
  getBezierPath: () => ['M 0 0 C 25 0 75 100 100 100', 50, 50],
}));

function edgeProps(data: FlowEdgeContractData, overrides: Partial<EdgeProps> = {}): EdgeProps {
  return {
    id: 'edge-1',
    source: 'source',
    target: 'target',
    sourceX: 0,
    sourceY: 0,
    targetX: 100,
    targetY: 100,
    sourcePosition: 'right' as EdgeProps['sourcePosition'],
    targetPosition: 'left' as EdgeProps['targetPosition'],
    data: { flowContract: data },
    ...overrides,
  };
}

describe('getFlowEdgePresentation', () => {
  it('uses the carried payload color and a target arrow', () => {
    expect(getFlowEdgePresentation({
      valid: true,
      carriedType: { kind: 'image' },
    })).toMatchObject({
      color: '#34d399',
      markerAtTarget: true,
      pattern: 'solid',
      typeLabel: 'image',
    });
  });

  it('adds a non-color pattern for typed containers and control values', () => {
    expect(getFlowEdgePresentation({
      valid: true,
      carriedType: { kind: 'list', item: { kind: 'text' } },
    })).toMatchObject({ color: '#22d3ee', pattern: 'container', dashArray: '8 4 2 4' });
    expect(getFlowEdgePresentation({
      valid: true,
      carriedType: { kind: 'control' },
    })).toMatchObject({ color: '#e2e8f0', pattern: 'control', dashArray: '3 3' });
  });

  it('renders invalid saved edges as red dashed warnings while retaining their type label', () => {
    expect(getFlowEdgePresentation({
      valid: false,
      carriedType: { kind: 'text' },
      reason: 'text cannot connect to image',
    })).toMatchObject({
      color: '#f87171',
      dashArray: '6 4',
      invalid: true,
      typeLabel: 'text',
    });
  });
});

describe('TypedFlowEdge', () => {
  it('renders a directional marker, accessible description, and selected type label', () => {
    const markup = renderToStaticMarkup(
      <svg>
        <TypedFlowEdge {...edgeProps({ valid: true, carriedType: { kind: 'video' } }, { selected: true })} />
      </svg>,
    );

    expect(markup).toContain('marker-end="url(#typed-flow-arrow-edge-1)"');
    expect(markup).toContain('data-edge-label="video"');
    expect(markup).toContain('aria-label="video flows from source to target"');
    expect(markup).toContain('stroke:#60a5fa');
  });

  it('preserves a user label and exposes an invalid reason', () => {
    const markup = renderToStaticMarkup(
      <svg>
        <TypedFlowEdge {...edgeProps({
          valid: false,
          carriedType: { kind: 'text' },
          reason: 'text cannot connect to image',
        }, { label: 'My edge' })} />
      </svg>,
    );

    expect(markup).toContain('data-edge-label="My edge"');
    expect(markup).toContain('aria-label="Invalid connection: text cannot connect to image"');
    expect(markup).toContain('stroke-dasharray:6 4');
  });
});
