import type { ImageLayerFilter, LayerFilterKind } from '../../types/imageEditor';

export function createDefaultLayerFilter(kind: LayerFilterKind): ImageLayerFilter {
  return {
    id: `filter-${kind}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    kind,
    enabled: true,
    amount: defaultFilterAmount(kind),
  };
}

export function layerFilterLabel(kind: LayerFilterKind): string {
  switch (kind) {
    case 'blur':
      return 'Blur';
    case 'sharpen':
      return 'Sharpen';
    case 'grayscale':
      return 'Grayscale';
    case 'sepia':
      return 'Sepia';
    case 'invert':
      return 'Invert';
    case 'noise':
      return 'Noise';
    case 'pixelate':
      return 'Pixelate';
  }
}

export function applyLayerFiltersToImageData(
  imageData: ImageData,
  filters: ImageLayerFilter[] | undefined,
): ImageData {
  let output = cloneImageData(imageData);
  for (const filter of filters ?? []) {
    if (!filter.enabled) continue;
    switch (filter.kind) {
      case 'blur':
        output = applyBoxBlur(output, filter.amount);
        break;
      case 'sharpen':
        output = applySharpen(output, filter.amount);
        break;
      case 'grayscale':
        output = applyGrayscale(output, filter.amount);
        break;
      case 'sepia':
        output = applySepia(output, filter.amount);
        break;
      case 'invert':
        output = applyInvert(output, filter.amount);
        break;
      case 'noise':
        output = applyNoise(output, filter.amount);
        break;
      case 'pixelate':
        output = applyPixelate(output, filter.amount);
        break;
    }
  }
  return output;
}

function defaultFilterAmount(kind: LayerFilterKind): number {
  switch (kind) {
    case 'blur':
    case 'pixelate':
      return 8;
    case 'noise':
      return 25;
    case 'sharpen':
      return 50;
    case 'grayscale':
    case 'sepia':
    case 'invert':
      return 100;
  }
}

function applyPixelate(source: ImageData, amount: number): ImageData {
  const size = Math.max(1, Math.round(amount));
  const output = cloneImageData(source);

  for (let blockY = 0; blockY < source.height; blockY += size) {
    for (let blockX = 0; blockX < source.width; blockX += size) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      const yMax = Math.min(source.height, blockY + size);
      const xMax = Math.min(source.width, blockX + size);

      for (let y = blockY; y < yMax; y += 1) {
        for (let x = blockX; x < xMax; x += 1) {
          const offset = (y * source.width + x) * 4;
          r += source.data[offset];
          g += source.data[offset + 1];
          b += source.data[offset + 2];
          a += source.data[offset + 3];
          count += 1;
        }
      }

      const average: [number, number, number, number] = [
        Math.round(r / count),
        Math.round(g / count),
        Math.round(b / count),
        Math.round(a / count),
      ];

      for (let y = blockY; y < yMax; y += 1) {
        for (let x = blockX; x < xMax; x += 1) {
          const offset = (y * output.width + x) * 4;
          output.data[offset] = average[0];
          output.data[offset + 1] = average[1];
          output.data[offset + 2] = average[2];
          output.data[offset + 3] = average[3];
        }
      }
    }
  }

  return output;
}

function applyNoise(source: ImageData, amount: number): ImageData {
  const strength = Math.max(0, Math.min(255, amount));
  const output = cloneImageData(source);

  forEachPixel(output, (offset) => {
    const pixelIndex = offset / 4;
    const delta = Math.round((pseudoRandom(pixelIndex) * 2 - 1) * strength);
    output.data[offset] = clampByte(source.data[offset] + delta);
    output.data[offset + 1] = clampByte(source.data[offset + 1] + delta);
    output.data[offset + 2] = clampByte(source.data[offset + 2] + delta);
    output.data[offset + 3] = source.data[offset + 3];
  });

  return output;
}

function pseudoRandom(index: number): number {
  const value = Math.sin((index + 1) * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function applyBoxBlur(source: ImageData, amount: number): ImageData {
  const radius = Math.max(0, Math.round(amount));
  if (radius === 0) return cloneImageData(source);

  const width = source.width;
  const height = source.height;

  // 1. Horizontal pass (sliding window)
  const temp = new Uint8ClampedArray(source.data.length);
  for (let y = 0; y < height; y += 1) {
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let aSum = 0;
    let count = 0;

    // Initialize window for x = 0
    const startX = -radius;
    const endX = radius;
    for (let xx = startX; xx <= endX; xx += 1) {
      if (xx >= 0 && xx < width) {
        const offset = (y * width + xx) * 4;
        rSum += source.data[offset];
        gSum += source.data[offset + 1];
        bSum += source.data[offset + 2];
        aSum += source.data[offset + 3];
        count += 1;
      }
    }

    for (let x = 0; x < width; x += 1) {
      const outOffset = (y * width + x) * 4;
      temp[outOffset] = Math.round(rSum / count);
      temp[outOffset + 1] = Math.round(gSum / count);
      temp[outOffset + 2] = Math.round(bSum / count);
      temp[outOffset + 3] = Math.round(aSum / count);

      // Slide window right: subtract element leaving, add element entering
      const leavingX = x - radius;
      if (leavingX >= 0 && leavingX < width) {
        const offset = (y * width + leavingX) * 4;
        rSum -= source.data[offset];
        gSum -= source.data[offset + 1];
        bSum -= source.data[offset + 2];
        aSum -= source.data[offset + 3];
        count -= 1;
      }

      const enteringX = x + radius + 1;
      if (enteringX >= 0 && enteringX < width) {
        const offset = (y * width + enteringX) * 4;
        rSum += source.data[offset];
        gSum += source.data[offset + 1];
        bSum += source.data[offset + 2];
        aSum += source.data[offset + 3];
        count += 1;
      }
    }
  }

  // 2. Vertical pass (sliding window) on intermediate result
  const output = cloneImageData(source);
  for (let x = 0; x < width; x += 1) {
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let aSum = 0;
    let count = 0;

    // Initialize window for y = 0
    const startY = -radius;
    const endY = radius;
    for (let yy = startY; yy <= endY; yy += 1) {
      if (yy >= 0 && yy < height) {
        const offset = (yy * width + x) * 4;
        rSum += temp[offset];
        gSum += temp[offset + 1];
        bSum += temp[offset + 2];
        aSum += temp[offset + 3];
        count += 1;
      }
    }

    for (let y = 0; y < height; y += 1) {
      const outOffset = (y * width + x) * 4;
      output.data[outOffset] = Math.round(rSum / count);
      output.data[outOffset + 1] = Math.round(gSum / count);
      output.data[outOffset + 2] = Math.round(bSum / count);
      output.data[outOffset + 3] = Math.round(aSum / count);

      // Slide window down: subtract element leaving, add element entering
      const leavingY = y - radius;
      if (leavingY >= 0 && leavingY < height) {
        const offset = (leavingY * width + x) * 4;
        rSum -= temp[offset];
        gSum -= temp[offset + 1];
        bSum -= temp[offset + 2];
        aSum -= temp[offset + 3];
        count -= 1;
      }

      const enteringY = y + radius + 1;
      if (enteringY >= 0 && enteringY < height) {
        const offset = (enteringY * width + x) * 4;
        rSum += temp[offset];
        gSum += temp[offset + 1];
        bSum += temp[offset + 2];
        aSum += temp[offset + 3];
        count += 1;
      }
    }
  }

  return output;
}

function applySharpen(source: ImageData, amount: number): ImageData {
  const mix = clamp01(amount / 100);
  const blurred = applyBoxBlur(source, 1);
  const output = cloneImageData(source);
  forEachPixel(output, (offset) => {
    output.data[offset] = clampByte(source.data[offset] + (source.data[offset] - blurred.data[offset]) * mix);
    output.data[offset + 1] = clampByte(source.data[offset + 1] + (source.data[offset + 1] - blurred.data[offset + 1]) * mix);
    output.data[offset + 2] = clampByte(source.data[offset + 2] + (source.data[offset + 2] - blurred.data[offset + 2]) * mix);
    output.data[offset + 3] = source.data[offset + 3];
  });
  return output;
}

function applyGrayscale(source: ImageData, amount: number): ImageData {
  const mix = clamp01(amount / 100);
  const output = cloneImageData(source);
  forEachPixel(output, (offset) => {
    const gray = clampByte(
      source.data[offset] * 0.2126 +
        source.data[offset + 1] * 0.7152 +
        source.data[offset + 2] * 0.0722,
    );
    output.data[offset] = mixByte(source.data[offset], gray, mix);
    output.data[offset + 1] = mixByte(source.data[offset + 1], gray, mix);
    output.data[offset + 2] = mixByte(source.data[offset + 2], gray, mix);
    output.data[offset + 3] = source.data[offset + 3];
  });
  return output;
}

function applySepia(source: ImageData, amount: number): ImageData {
  const mix = clamp01(amount / 100);
  const output = cloneImageData(source);
  forEachPixel(output, (offset) => {
    const r = source.data[offset];
    const g = source.data[offset + 1];
    const b = source.data[offset + 2];
    output.data[offset] = mixByte(r, clampByte(r * 0.393 + g * 0.769 + b * 0.189), mix);
    output.data[offset + 1] = mixByte(g, clampByte(r * 0.349 + g * 0.686 + b * 0.168), mix);
    output.data[offset + 2] = mixByte(b, clampByte(r * 0.272 + g * 0.534 + b * 0.131), mix);
    output.data[offset + 3] = source.data[offset + 3];
  });
  return output;
}

function applyInvert(source: ImageData, amount: number): ImageData {
  const mix = clamp01(amount / 100);
  const output = cloneImageData(source);
  forEachPixel(output, (offset) => {
    output.data[offset] = mixByte(source.data[offset], 255 - source.data[offset], mix);
    output.data[offset + 1] = mixByte(source.data[offset + 1], 255 - source.data[offset + 1], mix);
    output.data[offset + 2] = mixByte(source.data[offset + 2], 255 - source.data[offset + 2], mix);
    output.data[offset + 3] = source.data[offset + 3];
  });
  return output;
}

function forEachPixel(imageData: ImageData, callback: (offset: number) => void): void {
  for (let offset = 0; offset < imageData.data.length; offset += 4) {
    callback(offset);
  }
}

function cloneImageData(imageData: ImageData): ImageData {
  return {
    width: imageData.width,
    height: imageData.height,
    data: new Uint8ClampedArray(imageData.data),
  } as ImageData;
}

function mixByte(before: number, after: number, amount: number): number {
  return clampByte(before + (after - before) * amount);
}

function clampByte(value: number): number {
  return Math.round(Math.max(0, Math.min(255, value)));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}
