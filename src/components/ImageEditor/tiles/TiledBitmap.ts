export const TILE_SIZE = 256;

interface TileBuffer {
  data: Uint8ClampedArray;
  refs: number;
}

export interface TiledSnapshot {
  width: number;
  height: number;
  tiles: Map<number, TileBuffer>;
}

/** Real ImageData where available (browser/jsdom), else a plain shape for Node tests/workers. */
function makeImageData(data: Uint8ClampedArray<ArrayBuffer>, width: number, height: number): ImageData {
  if (typeof ImageData !== 'undefined') return new ImageData(data, width, height);
  return { width, height, data } as ImageData;
}

/**
 * Sparse, copy-on-write tile store for a layer's pixels. Pixels live in a `Map` of 256x256 RGBA8
 * tiles (absent tile = fully transparent); a write clones a tile only when it's shared with a
 * snapshot (copy-on-write), so `snapshot()` is cheap and preserves old pixels for undo. Pure and
 * DOM-free: runs in tests and workers. `materializeRegion`/`applyRegion` are the compatibility shim
 * later phases use to bridge existing full-bitmap code. (Phase 1 of the tiled-canvas architecture.)
 */
export class TiledBitmap {
  readonly width: number;
  readonly height: number;
  readonly tilesWide: number;
  readonly tilesHigh: number;
  private tiles = new Map<number, TileBuffer>();

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.tilesWide = Math.max(1, Math.ceil(width / TILE_SIZE));
    this.tilesHigh = Math.max(1, Math.ceil(height / TILE_SIZE));
  }

  private key(tx: number, ty: number): number {
    return ty * this.tilesWide + tx;
  }

  /** Compose the pixels in [x, y, x+w, y+h) into a fresh ImageData; absent tiles read as transparent. */
  materializeRegion(x: number, y: number, w: number, h: number): ImageData {
    const out = new Uint8ClampedArray(w * h * 4);
    const tx0 = Math.max(0, Math.floor(x / TILE_SIZE));
    const ty0 = Math.max(0, Math.floor(y / TILE_SIZE));
    const tx1 = Math.min(this.tilesWide - 1, Math.floor((x + w - 1) / TILE_SIZE));
    const ty1 = Math.min(this.tilesHigh - 1, Math.floor((y + h - 1) / TILE_SIZE));
    for (let ty = ty0; ty <= ty1; ty += 1) {
      for (let tx = tx0; tx <= tx1; tx += 1) {
        const tile = this.tiles.get(this.key(tx, ty));
        if (!tile) continue;
        const tileX = tx * TILE_SIZE;
        const tileY = ty * TILE_SIZE;
        const ix0 = Math.max(x, tileX);
        const iy0 = Math.max(y, tileY);
        const ix1 = Math.min(x + w, tileX + TILE_SIZE);
        const iy1 = Math.min(y + h, tileY + TILE_SIZE);
        const len = (ix1 - ix0) * 4;
        for (let py = iy0; py < iy1; py += 1) {
          const srcRow = ((py - tileY) * TILE_SIZE + (ix0 - tileX)) * 4;
          const dstRow = ((py - y) * w + (ix0 - x)) * 4;
          out.set(tile.data.subarray(srcRow, srcRow + len), dstRow);
        }
      }
    }
    return makeImageData(out, w, h);
  }

  /** Write `image` (covering [x, y, x+image.width, y+image.height)) into the tiles, copy-on-write. */
  applyRegion(x: number, y: number, image: ImageData): void {
    const w = image.width;
    const h = image.height;
    const tx0 = Math.max(0, Math.floor(x / TILE_SIZE));
    const ty0 = Math.max(0, Math.floor(y / TILE_SIZE));
    const tx1 = Math.min(this.tilesWide - 1, Math.floor((x + w - 1) / TILE_SIZE));
    const ty1 = Math.min(this.tilesHigh - 1, Math.floor((y + h - 1) / TILE_SIZE));
    for (let ty = ty0; ty <= ty1; ty += 1) {
      for (let tx = tx0; tx <= tx1; tx += 1) {
        const data = this.ensureWritable(tx, ty);
        const tileX = tx * TILE_SIZE;
        const tileY = ty * TILE_SIZE;
        const ix0 = Math.max(x, tileX);
        const iy0 = Math.max(y, tileY);
        const ix1 = Math.min(x + w, tileX + TILE_SIZE);
        const iy1 = Math.min(y + h, tileY + TILE_SIZE);
        const len = (ix1 - ix0) * 4;
        for (let py = iy0; py < iy1; py += 1) {
          const srcRow = ((py - y) * w + (ix0 - x)) * 4;
          const dstRow = ((py - tileY) * TILE_SIZE + (ix0 - tileX)) * 4;
          data.set(image.data.subarray(srcRow, srcRow + len), dstRow);
        }
      }
    }
  }

  private ensureWritable(tx: number, ty: number): Uint8ClampedArray {
    const k = this.key(tx, ty);
    const existing = this.tiles.get(k);
    if (!existing) {
      const buf: TileBuffer = { data: new Uint8ClampedArray(TILE_SIZE * TILE_SIZE * 4), refs: 1 };
      this.tiles.set(k, buf);
      return buf.data;
    }
    if (existing.refs > 1) {
      existing.refs -= 1;
      const clone: TileBuffer = { data: new Uint8ClampedArray(existing.data), refs: 1 };
      this.tiles.set(k, clone);
      return clone.data;
    }
    return existing.data;
  }

  /** Capture current tiles copy-on-write (shares buffers; future writes clone-on-touch). */
  snapshot(): TiledSnapshot {
    const tiles = new Map(this.tiles);
    for (const buf of tiles.values()) buf.refs += 1;
    return { width: this.width, height: this.height, tiles };
  }

  /** Restore tiles from a snapshot (undo). */
  restore(snap: TiledSnapshot): void {
    for (const buf of this.tiles.values()) buf.refs -= 1;
    this.tiles = new Map(snap.tiles);
    for (const buf of this.tiles.values()) buf.refs += 1;
  }

  /** Release a snapshot's hold on its tiles (e.g. when an undo step is evicted). */
  static disposeSnapshot(snap: TiledSnapshot): void {
    for (const buf of snap.tiles.values()) buf.refs -= 1;
  }

  /** Visit the coordinates of every non-empty tile. */
  forEachTile(callback: (tx: number, ty: number) => void): void {
    for (const k of this.tiles.keys()) {
      callback(k % this.tilesWide, Math.floor(k / this.tilesWide));
    }
  }
}
