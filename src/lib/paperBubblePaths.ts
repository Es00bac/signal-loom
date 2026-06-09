import type { PaperFrame } from '../types/paper';

interface Point {
  x: number;
  y: number;
}

const BUBBLE_CENTER: Point = { x: 50, y: 50 };
const TAIL_CURVE_MAX_OFFSET_RATIO = 0.3;

export function buildPaperBubblePath(frame: PaperFrame): string {
  return frame.kind === 'thoughtBubble'
    ? buildThoughtBubblePath(frame)
    : buildSpeechBubblePath(frame);
}

export function buildSpeechBubblePath(frame: PaperFrame): string {
  const tail = resolveBubbleTail(frame);
  const base = resolveBubbleBase(frame, frame.bubbleShape === 'oval' ? 45 : 43, frame.bubbleShape === 'oval' ? 39 : 37);
  const tailWidth = clamp(frame.bubbleTailWidthPercent ?? 18, 4, 38);
  const radiusX = frame.bubbleShape === 'squircle' ? 44 : 45 + clamp(frame.bubbleWarp ?? 0.18, -0.35, 0.5) * 4;
  const radiusY = frame.bubbleShape === 'squircle' ? 36 : 38 + clamp(frame.bubbleWarp ?? 0.18, -0.35, 0.5) * 5;
  const baseAngle = Math.atan2((base.y - BUBBLE_CENTER.y) / radiusY, (base.x - BUBBLE_CENTER.x) / radiusX);
  const tailGapRadians = clamp(tailWidth / 110, 0.06, 0.4);
  const startAngle = baseAngle - tailGapRadians;
  const endAngle = baseAngle + tailGapRadians;
  const start = pointOnEllipse(radiusX, radiusY, startAngle);
  const end = pointOnEllipse(radiusX, radiusY, endAngle);
  const curveHandle = resolveTailCurveHandle(base, tail, frame.bubbleTailCurvePercent);
  const tailInControl = lerpPoint(end, curveHandle, 0.62);
  const tailOutControl = lerpPoint(tail, curveHandle, 0.52);
  const returnInControl = lerpPoint(tail, curveHandle, 0.52);
  const returnOutControl = lerpPoint(start, curveHandle, 0.62);
  const bodyCommands = ellipseCubicArcCommands(radiusX, radiusY, startAngle, endAngle - Math.PI * 2);

  return `M ${formatPoint(start)} ${bodyCommands.join(' ')} C ${formatPoint(tailInControl)} ${formatPoint(tailOutControl)} ${formatPoint(tail)} C ${formatPoint(returnInControl)} ${formatPoint(returnOutControl)} ${formatPoint(start)} Z`;
}

export function buildThoughtBubblePath(frame: PaperFrame): string {
  const tail = resolveBubbleTail(frame);
  const base = resolveBubbleBase(frame, 43, 38);
  const path = [
    'M 50 5',
    'C 66 1 77 9 80 19',
    'C 94 20 100 34 94 47',
    'C 101 62 91 78 75 79',
    'C 70 93 52 99 39 91',
    'C 25 100 7 88 8 70',
    'C -3 60 0 40 12 34',
    'C 10 18 27 7 42 12',
    'C 44 9 47 6 50 5',
    'Z',
  ];
  const curveHandle = resolveTailCurveHandle(base, tail, frame.bubbleTailCurvePercent);
  const tailBubbleA = quadraticPoint(base, curveHandle, tail, 0.38);
  const tailBubbleB = quadraticPoint(base, curveHandle, tail, 0.68);

  return [
    path.join(' '),
    circleSubpath(tailBubbleA, 5.5),
    circleSubpath(tailBubbleB, 3.8),
    circleSubpath(tail, 2.4),
  ].join(' ');
}

export function resolveBubbleTailCurveHandle(frame: PaperFrame): Point {
  const tail = resolveBubbleTail(frame);
  const base = resolveBubbleBase(frame, 43, 38);
  return resolveTailCurveHandle(base, tail, frame.bubbleTailCurvePercent);
}

export function resolveBubbleTailCurvePercent(frame: PaperFrame, point: Point): number {
  const tail = resolveBubbleTail(frame);
  const base = resolveBubbleBase(frame, 43, 38);
  const axis = normalizePoint({
    x: tail.x - base.x,
    y: tail.y - base.y,
  });
  const distance = Math.max(1, Math.hypot(tail.x - base.x, tail.y - base.y));
  const midpoint = lerpPoint(base, tail, 0.5);
  const normal = { x: -axis.y, y: axis.x };
  const projectedOffset = ((point.x - midpoint.x) * normal.x) + ((point.y - midpoint.y) * normal.y);
  const maxOffset = distance * TAIL_CURVE_MAX_OFFSET_RATIO;
  return round(clamp(50 + (projectedOffset / maxOffset) * 50, 0, 100));
}

function resolveBubbleTail(frame: PaperFrame): Point {
  return {
    x: round(finiteOr(frame.tailXPercent, 72)),
    y: round(finiteOr(frame.tailYPercent, 92)),
  };
}

function resolveBubbleBase(frame: PaperFrame, radiusX: number, radiusY: number): Point {
  const targetX = clamp(frame.bubblePinchXPercent ?? 58, 0, 100);
  const targetY = clamp(frame.bubblePinchYPercent ?? 75, 0, 100);
  const normalizedX = (targetX - BUBBLE_CENTER.x) / radiusX;
  const normalizedY = (targetY - BUBBLE_CENTER.y) / radiusY;
  const length = Math.hypot(normalizedX, normalizedY);

  if (length < 0.001) {
    return pointOnEllipse(radiusX, radiusY, Math.PI / 2);
  }

  return {
    x: round(BUBBLE_CENTER.x + (normalizedX / length) * radiusX),
    y: round(BUBBLE_CENTER.y + (normalizedY / length) * radiusY),
  };
}

function pointOnEllipse(radiusX: number, radiusY: number, angle: number): Point {
  return {
    x: round(BUBBLE_CENTER.x + Math.cos(angle) * radiusX),
    y: round(BUBBLE_CENTER.y + Math.sin(angle) * radiusY),
  };
}

function ellipseCubicArcCommands(radiusX: number, radiusY: number, startAngle: number, endAngle: number): string[] {
  const delta = endAngle - startAngle;
  const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
  const step = delta / segments;
  const commands: string[] = [];

  for (let index = 0; index < segments; index += 1) {
    const angle0 = startAngle + step * index;
    const angle1 = angle0 + step;
    const alpha = (4 / 3) * Math.tan((angle1 - angle0) / 4);
    const control1 = {
      x: round(BUBBLE_CENTER.x + radiusX * (Math.cos(angle0) - alpha * Math.sin(angle0))),
      y: round(BUBBLE_CENTER.y + radiusY * (Math.sin(angle0) + alpha * Math.cos(angle0))),
    };
    const control2 = {
      x: round(BUBBLE_CENTER.x + radiusX * (Math.cos(angle1) + alpha * Math.sin(angle1))),
      y: round(BUBBLE_CENTER.y + radiusY * (Math.sin(angle1) - alpha * Math.cos(angle1))),
    };
    const end = pointOnEllipse(radiusX, radiusY, angle1);

    commands.push(`C ${formatPoint(control1)} ${formatPoint(control2)} ${formatPoint(end)}`);
  }

  return commands;
}

function circleSubpath(center: Point, radius: number): string {
  const r = round(radius);
  return `M ${formatPoint(center)} m ${r} 0 a ${r} ${r} 0 1 0 ${round(-r * 2)} 0 a ${r} ${r} 0 1 0 ${round(r * 2)} 0 Z`;
}

function lerpPoint(from: Point, to: Point, amount: number): Point {
  return {
    x: round(from.x + (to.x - from.x) * amount),
    y: round(from.y + (to.y - from.y) * amount),
  };
}

function quadraticPoint(from: Point, control: Point, to: Point, amount: number): Point {
  const inverse = 1 - amount;
  return {
    x: round((inverse * inverse * from.x) + (2 * inverse * amount * control.x) + (amount * amount * to.x)),
    y: round((inverse * inverse * from.y) + (2 * inverse * amount * control.y) + (amount * amount * to.y)),
  };
}

function resolveTailCurveHandle(base: Point, tail: Point, curvePercent: number | undefined): Point {
  const axis = normalizePoint({
    x: tail.x - base.x,
    y: tail.y - base.y,
  });
  const distance = Math.max(1, Math.hypot(tail.x - base.x, tail.y - base.y));
  const midpoint = lerpPoint(base, tail, 0.5);
  const normal = { x: -axis.y, y: axis.x };
  const curveAmount = (clamp(finiteOr(curvePercent, 55), 0, 100) - 50) / 50;
  const offset = distance * TAIL_CURVE_MAX_OFFSET_RATIO * curveAmount;
  return {
    x: round(midpoint.x + normal.x * offset),
    y: round(midpoint.y + normal.y * offset),
  };
}

function normalizePoint(point: Point): Point {
  const length = Math.hypot(point.x, point.y);
  if (length < 0.001) return { x: 0, y: 1 };
  return {
    x: point.x / length,
    y: point.y / length,
  };
}

function formatPoint(point: Point): string {
  return `${round(point.x)} ${round(point.y)}`;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
