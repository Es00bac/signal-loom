// Pure table model + grid operations for Paper. Framework-free and fully testable; the store actions
// and the canvas/inspector renderer build on these. A table lives on a frame (`frame.table`); cells are
// row-major plain strings (rich runs can come later). Every operation returns a new normalized spec.

export interface PaperTableSpec {
  rows: number;
  cols: number;
  /** Row-major cell text: cells[row][col]. Always normalized to exactly rows×cols. */
  cells: string[][];
  headerRow: boolean;
  borderWidthMm: number;
  cellPaddingMm: number;
}

const MAX_DIMENSION = 50;

function clampDimension(value: number): number {
  return Math.max(1, Math.min(MAX_DIMENSION, Math.round(value || 1)));
}

/** Force a spec to a clean rows×cols grid, padding/truncating cells and coercing numbers. */
export function normalizePaperTable(spec: Partial<PaperTableSpec> | undefined): PaperTableSpec {
  const rows = clampDimension(spec?.rows ?? 1);
  const cols = clampDimension(spec?.cols ?? 1);
  const source = Array.isArray(spec?.cells) ? spec!.cells : [];
  const cells = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      const value = source[r]?.[c];
      return typeof value === 'string' ? value : '';
    }),
  );
  return {
    rows,
    cols,
    cells,
    headerRow: spec?.headerRow ?? true,
    borderWidthMm: Number.isFinite(spec?.borderWidthMm) ? Math.max(0, spec!.borderWidthMm as number) : 0.2,
    cellPaddingMm: Number.isFinite(spec?.cellPaddingMm) ? Math.max(0, spec!.cellPaddingMm as number) : 1.5,
  };
}

/** A fresh table with empty cells. */
export function createPaperTable(rows = 3, cols = 3): PaperTableSpec {
  return normalizePaperTable({ rows, cols, cells: [], headerRow: true });
}

/** Set one cell's text, returning a new spec (no-op if the coordinate is out of range). */
export function setPaperTableCell(spec: PaperTableSpec, row: number, col: number, value: string): PaperTableSpec {
  const table = normalizePaperTable(spec);
  if (row < 0 || row >= table.rows || col < 0 || col >= table.cols) return table;
  const cells = table.cells.map((line, r) => (r === row ? line.map((cell, c) => (c === col ? value : cell)) : line));
  return { ...table, cells };
}

/** Insert a blank row at `atIndex` (default: append). */
export function addPaperTableRow(spec: PaperTableSpec, atIndex?: number): PaperTableSpec {
  const table = normalizePaperTable(spec);
  if (table.rows >= MAX_DIMENSION) return table;
  const index = atIndex === undefined ? table.rows : Math.max(0, Math.min(table.rows, Math.round(atIndex)));
  const blank = Array.from({ length: table.cols }, () => '');
  const cells = [...table.cells.slice(0, index), blank, ...table.cells.slice(index)];
  return normalizePaperTable({ ...table, rows: table.rows + 1, cells });
}

/** Insert a blank column at `atIndex` (default: append). */
export function addPaperTableColumn(spec: PaperTableSpec, atIndex?: number): PaperTableSpec {
  const table = normalizePaperTable(spec);
  if (table.cols >= MAX_DIMENSION) return table;
  const index = atIndex === undefined ? table.cols : Math.max(0, Math.min(table.cols, Math.round(atIndex)));
  const cells = table.cells.map((line) => [...line.slice(0, index), '', ...line.slice(index)]);
  return normalizePaperTable({ ...table, cols: table.cols + 1, cells });
}

/** Remove the row at `index` (keeps at least one row). */
export function removePaperTableRow(spec: PaperTableSpec, index: number): PaperTableSpec {
  const table = normalizePaperTable(spec);
  if (table.rows <= 1 || index < 0 || index >= table.rows) return table;
  const cells = table.cells.filter((_, r) => r !== index);
  return normalizePaperTable({ ...table, rows: table.rows - 1, cells });
}

/** Remove the column at `index` (keeps at least one column). */
export function removePaperTableColumn(spec: PaperTableSpec, index: number): PaperTableSpec {
  const table = normalizePaperTable(spec);
  if (table.cols <= 1 || index < 0 || index >= table.cols) return table;
  const cells = table.cells.map((line) => line.filter((_, c) => c !== index));
  return normalizePaperTable({ ...table, cols: table.cols - 1, cells });
}
