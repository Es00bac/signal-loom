// Pure text-composition core for the Paper workspace. Given a story's text, a type spec, and a set
// of frames (each split into column boxes, in mm), it greedily wraps and stacks lines, flowing the
// remainder from one frame's columns into the next. The remainder that does not fit is returned as
// `overset` — the basis for threaded text, column flow, runaround, and overset preflight.
//
// Framework-free and measurement-agnostic: the caller injects a `PaperTextMeasurer` (a real DOM/canvas
// measurer in the app; a deterministic fake in tests).

export interface PaperTextFlowTypeSpec {
  fontFamily: string;
  fontSizePt: number;
  leadingPt: number;
  tracking: number;
  align: 'left' | 'center' | 'right' | 'justify';
  fontWeight?: string;
  fontStyle?: string;
}

export interface PaperTextFlowColumn {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

export interface PaperTextFlowFrame {
  id: string;
  columns: PaperTextFlowColumn[];
  /** Obstacles to flow around inside THIS frame (frame-local mm). Overrides the call-wide default. */
  exclusions?: PaperTextFlowExclusion[];
}

export interface PaperTextFlowPoint {
  xMm: number;
  yMm: number;
}

/**
 * An obstacle outline (in the same frame-local mm space as the columns) that text must flow around,
 * with an optional standoff gap kept clear on every side. Powers text wrap / runaround: each line's
 * usable box is narrowed to the widest sub-interval of its column not covered by an exclusion band.
 */
export interface PaperTextFlowExclusion {
  points: PaperTextFlowPoint[];
  standoffMm?: number;
}

/** Width in mm of a rendered text fragment at the given type spec. */
export type PaperTextMeasurer = (text: string, spec: PaperTextFlowTypeSpec) => number;

export interface PaperTextFlowLine {
  text: string;
  xMm: number;
  yMm: number;
  widthMm: number;
}

export interface PaperTextFlowFrameResult {
  frameId: string;
  lines: PaperTextFlowLine[];
  /** The contiguous slice of the original text that flowed into this frame (for threaded rendering). */
  sourceText: string;
}

export interface PaperTextFlowResult {
  frames: PaperTextFlowFrameResult[];
  overset: string;
  fits: boolean;
}

const EPSILON_MM = 1e-6;

function ptToMm(pt: number): number {
  return (pt * 25.4) / 72;
}

interface FlowToken {
  kind: 'word' | 'break';
  text: string;
  start: number;
}

function tokenize(text: string): FlowToken[] {
  const tokens: FlowToken[] = [];
  const lines = text.split('\n');
  let offset = 0;

  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) {
      tokens.push({ kind: 'break', text: '\n', start: offset - 1 });
    }
    const wordPattern = /\S+/g;
    let match: RegExpExecArray | null;
    while ((match = wordPattern.exec(line)) !== null) {
      tokens.push({ kind: 'word', text: match[0], start: offset + match.index });
    }
    offset += line.length + 1;
  });

  return tokens;
}

interface NextLineResult {
  text: string;
  widthMm: number;
  nextIndex: number;
}

function buildNextLine(
  tokens: FlowToken[],
  startIndex: number,
  columnWidthMm: number,
  measure: PaperTextMeasurer,
  spec: PaperTextFlowTypeSpec,
): NextLineResult {
  let index = startIndex;

  // A paragraph break terminates the previous line; the next line starts after it.
  if (index < tokens.length && tokens[index].kind === 'break') {
    index += 1;
  }

  const words: string[] = [];
  while (index < tokens.length && tokens[index].kind === 'word') {
    const candidate = [...words, tokens[index].text].join(' ');
    const candidateWidth = measure(candidate, spec);
    if (words.length === 0 || candidateWidth <= columnWidthMm + EPSILON_MM) {
      words.push(tokens[index].text);
      index += 1;
      // A single word wider than the column is placed alone, then the line ends.
      if (candidateWidth > columnWidthMm + EPSILON_MM) {
        break;
      }
    } else {
      break;
    }
  }

  const text = words.join(' ');
  return { text, widthMm: text ? measure(text, spec) : 0, nextIndex: index };
}

function alignLineX(box: { xMm: number; widthMm: number }, widthMm: number, align: PaperTextFlowTypeSpec['align']): number {
  switch (align) {
    case 'right':
      return box.xMm + box.widthMm - widthMm;
    case 'center':
      return box.xMm + (box.widthMm - widthMm) / 2;
    default:
      return box.xMm;
  }
}

/**
 * Horizontal extent [leftMm, rightMm] of a polygon's boundary across the vertical band [yTop, yBot],
 * or null when the polygon does not occupy the band. Sampling endpoints-in-band plus the edge crossings
 * at the band edges yields the exact extreme x for piecewise-linear (polygon) boundaries.
 */
function polygonBandExtent(points: PaperTextFlowPoint[], yTop: number, yBot: number): [number, number] | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let hit = false;
  const consider = (x: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    hit = true;
  };

  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const edgeTop = Math.min(a.yMm, b.yMm);
    const edgeBot = Math.max(a.yMm, b.yMm);
    if (edgeBot < yTop - EPSILON_MM || edgeTop > yBot + EPSILON_MM) continue;

    if (a.yMm >= yTop - EPSILON_MM && a.yMm <= yBot + EPSILON_MM) consider(a.xMm);
    if (b.yMm >= yTop - EPSILON_MM && b.yMm <= yBot + EPSILON_MM) consider(b.xMm);

    const dy = b.yMm - a.yMm;
    if (Math.abs(dy) > EPSILON_MM) {
      for (const yy of [yTop, yBot]) {
        if (yy >= edgeTop - EPSILON_MM && yy <= edgeBot + EPSILON_MM) {
          consider(a.xMm + ((b.xMm - a.xMm) * (yy - a.yMm)) / dy);
        }
      }
    }
  }

  return hit ? [minX, maxX] : null;
}

/** The blocked x-interval an exclusion imposes on the band [yTop, yBot], inflated by its standoff. */
function bandBlockedInterval(exclusion: PaperTextFlowExclusion, yTop: number, yBot: number): [number, number] | null {
  const standoff = Math.max(0, exclusion.standoffMm ?? 0);
  const extent = polygonBandExtent(exclusion.points, yTop - standoff, yBot + standoff);
  if (!extent) return null;
  return [extent[0] - standoff, extent[1] + standoff];
}

/** Free sub-intervals of `base` after removing every blocked interval (sorted, left to right). */
function subtractIntervals(base: [number, number], blocks: [number, number][]): [number, number][] {
  const merged = blocks
    .map(([l, r]): [number, number] => [Math.max(l, base[0]), Math.min(r, base[1])])
    .filter(([l, r]) => r - l > EPSILON_MM)
    .sort((a, b) => a[0] - b[0]);

  const free: [number, number][] = [];
  let cursor = base[0];
  for (const [l, r] of merged) {
    if (r <= cursor) continue;
    if (l > cursor) free.push([cursor, l]);
    cursor = Math.max(cursor, r);
    if (cursor >= base[1]) break;
  }
  if (cursor < base[1] - EPSILON_MM) free.push([cursor, base[1]]);
  return free.filter(([l, r]) => r - l > EPSILON_MM);
}

/** A band narrower than this (mm) is treated as fully blocked — text skips down past the obstacle. */
const MIN_RUNAROUND_LINE_MM = 2;

export function flowPaperText(
  text: string,
  spec: PaperTextFlowTypeSpec,
  frames: PaperTextFlowFrame[],
  measure: PaperTextMeasurer,
  exclusions: PaperTextFlowExclusion[] = [],
): PaperTextFlowResult {
  const tokens = tokenize(text);
  const leadingMm = ptToMm(spec.leadingPt > 0 ? spec.leadingPt : spec.fontSizePt * 1.2);
  let index = 0;

  const frameResults: PaperTextFlowFrameResult[] = frames.map((frame) => {
    const frameStartIndex = index;
    const lines: PaperTextFlowLine[] = [];
    const frameExclusions = frame.exclusions ?? exclusions;

    for (const column of frame.columns) {
      const columnBottom = column.yMm + column.heightMm;
      let y = column.yMm;

      while (index < tokens.length && y + leadingMm <= columnBottom + EPSILON_MM) {
        // Narrow the line's usable box to the widest part of the column left clear by any exclusion
        // band; a fully blocked band is skipped so the text resumes below the obstacle.
        let lineBox: { xMm: number; widthMm: number } = { xMm: column.xMm, widthMm: column.widthMm };
        if (frameExclusions.length > 0) {
          const blocks: [number, number][] = [];
          for (const exclusion of frameExclusions) {
            const blocked = bandBlockedInterval(exclusion, y, y + leadingMm);
            if (blocked) blocks.push(blocked);
          }
          if (blocks.length > 0) {
            const free = subtractIntervals([column.xMm, column.xMm + column.widthMm], blocks);
            const widest = free.reduce<[number, number] | null>(
              (best, cur) => (best === null || cur[1] - cur[0] > best[1] - best[0] ? cur : best),
              null,
            );
            if (!widest || widest[1] - widest[0] < MIN_RUNAROUND_LINE_MM) {
              y += leadingMm;
              continue;
            }
            lineBox = { xMm: widest[0], widthMm: widest[1] - widest[0] };
          }
        }

        const line = buildNextLine(tokens, index, lineBox.widthMm, measure, spec);
        if (line.nextIndex === index) {
          break;
        }

        const remainderHasWords = tokens.slice(line.nextIndex).some((token) => token.kind === 'word');
        if (line.text === '' && !remainderHasWords) {
          index = line.nextIndex;
          break;
        }

        lines.push({
          text: line.text,
          xMm: alignLineX(lineBox, line.widthMm, spec.align),
          yMm: y,
          widthMm: line.widthMm,
        });
        y += leadingMm;
        index = line.nextIndex;
      }
    }

    const lastTokenIndex = index - 1;
    const sourceText = frameStartIndex < index
      ? text.slice(tokens[frameStartIndex].start, tokens[lastTokenIndex].start + tokens[lastTokenIndex].text.length)
      : '';

    return { frameId: frame.id, lines, sourceText };
  });

  const overset = index < tokens.length ? text.slice(tokens[index].start) : '';
  return { frames: frameResults, overset, fits: overset.trim() === '' };
}
