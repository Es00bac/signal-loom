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

function alignLineX(column: PaperTextFlowColumn, widthMm: number, align: PaperTextFlowTypeSpec['align']): number {
  switch (align) {
    case 'right':
      return column.xMm + column.widthMm - widthMm;
    case 'center':
      return column.xMm + (column.widthMm - widthMm) / 2;
    default:
      return column.xMm;
  }
}

export function flowPaperText(
  text: string,
  spec: PaperTextFlowTypeSpec,
  frames: PaperTextFlowFrame[],
  measure: PaperTextMeasurer,
): PaperTextFlowResult {
  const tokens = tokenize(text);
  const leadingMm = ptToMm(spec.leadingPt > 0 ? spec.leadingPt : spec.fontSizePt * 1.2);
  let index = 0;

  const frameResults: PaperTextFlowFrameResult[] = frames.map((frame) => {
    const lines: PaperTextFlowLine[] = [];

    for (const column of frame.columns) {
      const columnBottom = column.yMm + column.heightMm;
      let y = column.yMm;

      while (index < tokens.length && y + leadingMm <= columnBottom + EPSILON_MM) {
        const line = buildNextLine(tokens, index, column.widthMm, measure, spec);
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
          xMm: alignLineX(column, line.widthMm, spec.align),
          yMm: y,
          widthMm: line.widthMm,
        });
        y += leadingMm;
        index = line.nextIndex;
      }
    }

    return { frameId: frame.id, lines };
  });

  const overset = index < tokens.length ? text.slice(tokens[index].start) : '';
  return { frames: frameResults, overset, fits: overset.trim() === '' };
}
