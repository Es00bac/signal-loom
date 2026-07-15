import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import {
  getFlowEdgePresentation,
  readFlowEdgeContract,
} from './flowEdgePresentation';

export function TypedFlowEdge({
  data,
  id,
  label,
  labelBgBorderRadius,
  labelBgPadding,
  labelBgStyle,
  labelShowBg,
  labelStyle,
  markerStart,
  selected,
  source,
  sourcePosition,
  sourceX,
  sourceY,
  style,
  target,
  targetPosition,
  targetX,
  targetY,
}: EdgeProps) {
  const contract = readFlowEdgeContract(data);
  const presentation = getFlowEdgePresentation(contract);
  const [path, labelX, labelY] = getBezierPath({
    sourcePosition,
    sourceX,
    sourceY,
    targetPosition,
    targetX,
    targetY,
  });
  const markerId = `typed-flow-arrow-${sanitizeSvgId(id)}`;
  const accessibleLabel = presentation.invalid
    ? `Invalid connection: ${contract?.reason ?? 'incompatible value types'}`
    : `${presentation.typeLabel} flows from ${source} to ${target}`;

  return (
    <>
      <defs>
        <marker
          id={markerId}
          markerHeight="8"
          markerUnits="strokeWidth"
          markerWidth="8"
          orient="auto"
          refX="7"
          refY="4"
          viewBox="0 0 8 8"
        >
          <path d="M 0 0 L 8 4 L 0 8 z" fill={presentation.color} />
        </marker>
      </defs>
      <BaseEdge
        aria-label={accessibleLabel}
        className="typed-flow-edge-path"
        id={id}
        label={label ?? (selected ? presentation.typeLabel : undefined)}
        labelBgBorderRadius={labelBgBorderRadius}
        labelBgPadding={labelBgPadding}
        labelBgStyle={{ fill: '#111827', fillOpacity: 0.92, ...labelBgStyle }}
        labelShowBg={labelShowBg ?? true}
        labelStyle={{ fill: presentation.color, fontSize: 10, fontWeight: 700, ...labelStyle }}
        labelX={labelX}
        labelY={labelY}
        markerEnd={`url(#${markerId})`}
        markerStart={markerStart}
        path={path}
        style={{
          ...style,
          stroke: presentation.color,
          strokeDasharray: presentation.dashArray,
          strokeWidth: presentation.strokeWidth,
        }}
      />
    </>
  );
}

function sanitizeSvgId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}
