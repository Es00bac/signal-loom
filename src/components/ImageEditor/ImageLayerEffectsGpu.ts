/**
 * WebGL2 accelerator for the heavy layer effects. It eliminates the per-pixel JS
 * compositing/blur passes — each ~70ms on a 4-megapixel layer — by doing the spread
 * blur and the final composite in fragment shaders and reading the result back with a
 * single GPU canvas copy (~5ms) instead of a getImageData/putImageData round trip.
 *
 * Portability is the priority (desktop Electron on AMD/NVIDIA via ANGLE, and the Android
 * WebView on Adreno):
 *   - WebGL2 + RGBA8 textures ONLY — no float render targets, no extensions, which are
 *     the features with patchy mobile/Adreno support.
 *   - MAX_TEXTURE_SIZE is checked so we never exceed a device limit (4096 on some mobile
 *     GPUs vs 16384 on desktop).
 *   - Context-loss aware, and EVERYTHING is wrapped so any failure returns null and the
 *     caller falls back to the (O(W×H)) CPU path. Correctness is identical on every GPU;
 *     this module is a best-effort speed-up, never a correctness dependency.
 *
 * Stroke distance still uses the CPU distance transform (`computeStrokeFeatherField`,
 * shared/tested) uploaded as a coverage texture — the colorise + composite is what moves
 * to the GPU. (A GPU jump-flood stroke was prototyped but had a position-dependent
 * correctness bug, so it was deferred rather than shipped.)
 */
import type { ImageLayerEffect, LayerBitmap } from '../../types/imageEditor';
import { createBitmap } from './LayerBitmap';
import { computeStrokeFeatherField, type RenderedLayerWithEffects } from './ImageLayerEffects';

export interface EffectPadding {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Effect kinds this GPU path can render. Anything else => CPU fallback.
 *
 * `outerGlow` is intentionally excluded: its GPU result diverged from the CPU reference
 * by ~30% within the glow band on parity testing (the masked-outside falloff profile
 * differs), so it falls back to the (correct, O(W×H)) CPU renderer until the glow shader
 * matches. stroke/dropShadow/colorOverlay are parity-verified (0 / ~0.2 / 0 avg channel
 * diff vs CPU on the real GPU).
 */
const GPU_SUPPORTED_KINDS = new Set<ImageLayerEffect['kind']>([
  'stroke',
  'dropShadow',
  'colorOverlay',
]);

const VERTEX_SHADER = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  // Flip Y so texture row 0 (top of the ImageData) maps to the top of the output.
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Separable box blur of a texture's alpha channel. Bounded sample count with a step so
// large radii stay cheap and within mobile shader limits.
const BLUR_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uTex;
uniform vec2 uTexel;     // 1/size
uniform vec2 uAxis;      // (1,0) horizontal or (0,1) vertical
uniform int uRadius;
uniform int uStep;
in vec2 vUv;
out vec4 fragColor;
void main() {
  float sum = 0.0;
  float count = 0.0;
  for (int i = -128; i <= 128; i++) {
    int off = i * uStep;
    if (off < -uRadius || off > uRadius) continue;
    vec2 uv = vUv + uAxis * uTexel * float(off);
    sum += texture(uTex, uv).a;
    count += 1.0;
  }
  float a = count > 0.0 ? sum / count : 0.0;
  fragColor = vec4(0.0, 0.0, 0.0, a);
}`;

const COMPOSITE_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uContent;
uniform sampler2D uShadow;
uniform sampler2D uGlow;
uniform sampler2D uStroke;
uniform bool uHasShadow;
uniform bool uHasGlow;
uniform bool uHasStroke;
uniform bool uHasOverlay;
uniform vec3 uShadowColor;
uniform vec3 uGlowColor;
uniform vec3 uStrokeColor;
uniform vec3 uOverlayColor;
uniform float uShadowOpacity;
uniform float uGlowOpacity;
uniform float uStrokeOpacity;
uniform float uOverlayOpacity;
in vec2 vUv;
out vec4 fragColor;

// src is already premultiplied; dst is the premultiplied accumulator (back-to-front).
vec4 over(vec4 dst, vec4 src) {
  return src + dst * (1.0 - src.a);
}

void main() {
  vec4 acc = vec4(0.0);
  float contentAlpha = texture(uContent, vUv).a;

  if (uHasShadow) {
    float a = texture(uShadow, vUv).a * uShadowOpacity;
    acc = over(acc, vec4(uShadowColor * a, a));
  }
  if (uHasGlow) {
    // Outer glow only shows outside the source content (matches the CPU outsideOnly).
    float mask = contentAlpha > 0.0 ? 0.0 : 1.0;
    float a = texture(uGlow, vUv).a * uGlowOpacity * mask;
    acc = over(acc, vec4(uGlowColor * a, a));
  }
  if (uHasStroke) {
    float a = texture(uStroke, vUv).r * uStrokeOpacity;
    acc = over(acc, vec4(uStrokeColor * a, a));
  }

  vec4 content = texture(uContent, vUv);
  if (uHasOverlay && content.a > 0.0) {
    content.rgb = mix(content.rgb, uOverlayColor, uOverlayOpacity);
  }
  acc = over(acc, vec4(content.rgb * content.a, content.a));

  fragColor = acc.a > 0.0 ? vec4(acc.rgb / acc.a, acc.a) : vec4(0.0);
}`;

interface GpuResources {
  gl: WebGL2RenderingContext;
  canvas: OffscreenCanvas;
  blur: WebGLProgram;
  composite: WebGLProgram;
  vao: WebGLVertexArrayObject;
  maxTexture: number;
}

let resources: GpuResources | null | undefined;

function getResources(): GpuResources | null {
  if (resources !== undefined) return resources;
  resources = createResources();
  return resources;
}

function createResources(): GpuResources | null {
  try {
    if (typeof OffscreenCanvas === 'undefined') return null;
    const canvas = new OffscreenCanvas(1, 1);
    const gl = canvas.getContext('webgl2', {
      premultipliedAlpha: false,
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) return null;

    const blur = linkProgram(gl, VERTEX_SHADER, BLUR_FRAGMENT);
    const composite = linkProgram(gl, VERTEX_SHADER, COMPOSITE_FRAGMENT);
    if (!blur || !composite) return null;

    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    if (!vao || !buffer) return null;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // Full-screen triangle. aPos is bound to location 0 in every program (see
    // linkProgram), so this single VAO drives all of them.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    return { gl, canvas, blur, composite, vao, maxTexture };
  } catch {
    return null;
  }
}

function linkProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  // Pin aPos to location 0 so one shared VAO works for every program.
  gl.bindAttribLocation(program, 0, 'aPos');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/** Drops the cached context (e.g. after a context-loss event). Next call recreates it. */
export function resetLayerEffectGpu(): void {
  resources = undefined;
}

function parseColor(color: string): [number, number, number] {
  const t = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(t)) {
    return [parseInt(t.slice(1, 3), 16) / 255, parseInt(t.slice(3, 5), 16) / 255, parseInt(t.slice(5, 7), 16) / 255];
  }
  if (/^#[0-9a-f]{3}$/i.test(t)) {
    return [parseInt(t[1] + t[1], 16) / 255, parseInt(t[2] + t[2], 16) / 255, parseInt(t[3] + t[3], 16) / 255];
  }
  return [1, 1, 1];
}

/**
 * Renders the styled layer bitmap on the GPU, or returns null (any unsupported effect,
 * oversized output, or GL failure) so the caller uses the CPU path. `source` is the
 * already mask/filter-resolved layer pixels.
 */
export function tryRenderLayerEffectsGpu(
  source: ImageData,
  enabledEffects: readonly ImageLayerEffect[],
  padding: EffectPadding,
): RenderedLayerWithEffects | null {
  if (enabledEffects.length === 0) return null;
  for (const effect of enabledEffects) {
    if (!GPU_SUPPORTED_KINDS.has(effect.kind)) return null;
  }

  // v1 composites at most one of each kind; multiple of a kind => CPU fallback.
  const counts = new Map<ImageLayerEffect['kind'], number>();
  for (const effect of enabledEffects) {
    counts.set(effect.kind, (counts.get(effect.kind) ?? 0) + 1);
  }
  for (const count of counts.values()) {
    if (count > 1) return null;
  }

  type Of<K extends ImageLayerEffect['kind']> = Extract<ImageLayerEffect, { kind: K }>;
  const stroke = enabledEffects.find((e) => e.kind === 'stroke') as Of<'stroke'> | undefined;
  const shadow = enabledEffects.find((e) => e.kind === 'dropShadow') as Of<'dropShadow'> | undefined;
  const glow = enabledEffects.find((e) => e.kind === 'outerGlow') as Of<'outerGlow'> | undefined;
  const overlay = enabledEffects.find((e) => e.kind === 'colorOverlay') as Of<'colorOverlay'> | undefined;

  const res = getResources();
  if (!res) return null;
  const { gl } = res;
  if (gl.isContextLost()) {
    resetLayerEffectGpu();
    return null;
  }

  const width = source.width + padding.left + padding.right;
  const height = source.height + padding.top + padding.bottom;
  if (width <= 0 || height <= 0) return null;
  if (width > res.maxTexture || height > res.maxTexture) return null;

  const created: WebGLTexture[] = [];
  const createdFbos: WebGLFramebuffer[] = [];
  try {
    res.canvas.width = width;
    res.canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    const makeTex = (): WebGLTexture => {
      const tex = gl.createTexture();
      if (!tex) throw new Error('texture');
      created.push(tex);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    };

    // Content texture: transparent W×H with the source placed at the padding origin.
    const contentTex = makeTex();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, padding.left, padding.top, gl.RGBA, gl.UNSIGNED_BYTE, source);

    // Drop-shadow blurred alpha.
    let shadowTex: WebGLTexture | null = null;
    if (shadow) {
      const offsetX = Math.round(Math.cos((shadow.angle * Math.PI) / 180) * shadow.distance);
      const offsetY = Math.round(Math.sin((shadow.angle * Math.PI) / 180) * shadow.distance);
      const placed = makeTex();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const px = padding.left + offsetX;
      const py = padding.top + offsetY;
      if (px < width && py < height && px + source.width > 0 && py + source.height > 0) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, Math.max(0, px), Math.max(0, py), gl.RGBA, gl.UNSIGNED_BYTE, source);
      }
      shadowTex = blurAlpha(res, placed, width, height, Math.max(0, Math.round(shadow.size)), created, createdFbos);
    }

    // Outer-glow blurred alpha (from the content alpha, masked outside in the composite).
    let glowTex: WebGLTexture | null = null;
    if (glow) {
      glowTex = blurAlpha(res, contentTex, width, height, Math.max(0, Math.round(glow.size)), created, createdFbos);
    }

    // Stroke coverage from the shared/tested CPU distance transform.
    let strokeTex: WebGLTexture | null = null;
    if (stroke && Math.round(stroke.size) > 0) {
      const feather = computeStrokeFeatherField(source, stroke, width, height, padding.left, padding.top);
      if (feather) {
        const bytes = new Uint8Array(width * height * 4);
        for (let i = 0; i < feather.length; i += 1) {
          bytes[i * 4] = Math.round(Math.max(0, Math.min(1, feather[i])) * 255);
        }
        strokeTex = makeTex();
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      }
    }

    // Composite to the default framebuffer (the GL canvas).
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(res.composite);
    gl.bindVertexArray(res.vao);

    bindTexUnit(gl, res.composite, 'uContent', contentTex, 0);
    bindTexUnit(gl, res.composite, 'uShadow', shadowTex ?? contentTex, 1);
    bindTexUnit(gl, res.composite, 'uGlow', glowTex ?? contentTex, 2);
    bindTexUnit(gl, res.composite, 'uStroke', strokeTex ?? contentTex, 3);

    setBool(gl, res.composite, 'uHasShadow', !!shadowTex);
    setBool(gl, res.composite, 'uHasGlow', !!glowTex);
    setBool(gl, res.composite, 'uHasStroke', !!strokeTex);
    setBool(gl, res.composite, 'uHasOverlay', !!overlay);

    setColor(gl, res.composite, 'uShadowColor', shadow ? shadow.color : '#000000');
    setColor(gl, res.composite, 'uGlowColor', glow ? glow.color : '#ffffff');
    setColor(gl, res.composite, 'uStrokeColor', stroke ? stroke.color : '#ffffff');
    setColor(gl, res.composite, 'uOverlayColor', overlay ? overlay.color : '#ffffff');
    setFloat(gl, res.composite, 'uShadowOpacity', shadow ? shadow.opacity : 0);
    setFloat(gl, res.composite, 'uGlowOpacity', glow ? glow.opacity : 0);
    setFloat(gl, res.composite, 'uStrokeOpacity', stroke ? stroke.opacity : 0);
    setFloat(gl, res.composite, 'uOverlayOpacity', overlay ? overlay.opacity : 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);

    if (gl.isContextLost()) {
      resetLayerEffectGpu();
      return null;
    }

    // Single GPU canvas copy into a fresh output bitmap (no per-pixel readback).
    const output = createBitmap(width, height);
    const ctx = output.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(res.canvas as unknown as CanvasImageSource, 0, 0);

    return {
      bitmap: output as LayerBitmap,
      offsetX: padding.left === 0 ? 0 : -padding.left,
      offsetY: padding.top === 0 ? 0 : -padding.top,
    };
  } catch {
    return null;
  } finally {
    for (const fbo of createdFbos) gl.deleteFramebuffer(fbo);
    for (const tex of created) gl.deleteTexture(tex);
  }
}

/** Two-pass separable box blur of `src`'s alpha into a freshly allocated texture. */
function blurAlpha(
  res: GpuResources,
  src: WebGLTexture,
  width: number,
  height: number,
  radius: number,
  created: WebGLTexture[],
  createdFbos: WebGLFramebuffer[],
): WebGLTexture {
  const { gl } = res;
  const makeTarget = (): WebGLTexture => {
    const tex = gl.createTexture();
    if (!tex) throw new Error('texture');
    created.push(tex);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  };
  if (radius <= 0) {
    return runBlurPass(res, src, makeTarget(), width, height, 0, [1, 0], createdFbos);
  }
  // Two passes ≈ a triangular falloff over ~radius; bound the per-pass sample count.
  const half = Math.max(1, Math.round(radius / 2));
  const step = Math.max(1, Math.ceil(half / 128));
  const horizontal = runBlurPass(res, src, makeTarget(), width, height, half, [1, 0], createdFbos, step);
  const vertical = runBlurPass(res, horizontal, makeTarget(), width, height, half, [0, 1], createdFbos, step);
  return vertical;
}

function runBlurPass(
  res: GpuResources,
  src: WebGLTexture,
  dst: WebGLTexture,
  width: number,
  height: number,
  radius: number,
  axis: [number, number],
  createdFbos: WebGLFramebuffer[],
  step = 1,
): WebGLTexture {
  const { gl } = res;
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error('fbo');
  createdFbos.push(fbo);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error('fbo-incomplete');
  }
  gl.viewport(0, 0, width, height);
  gl.useProgram(res.blur);
  gl.bindVertexArray(res.vao);
  bindTexUnit(gl, res.blur, 'uTex', src, 0);
  setVec2(gl, res.blur, 'uTexel', 1 / width, 1 / height);
  setVec2(gl, res.blur, 'uAxis', axis[0], axis[1]);
  setInt(gl, res.blur, 'uRadius', radius);
  setInt(gl, res.blur, 'uStep', Math.max(1, step));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return dst;
}

function bindTexUnit(gl: WebGL2RenderingContext, program: WebGLProgram, name: string, tex: WebGLTexture, unit: number): void {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(gl.getUniformLocation(program, name), unit);
}
function setBool(gl: WebGL2RenderingContext, program: WebGLProgram, name: string, value: boolean): void {
  gl.uniform1i(gl.getUniformLocation(program, name), value ? 1 : 0);
}
function setFloat(gl: WebGL2RenderingContext, program: WebGLProgram, name: string, value: number): void {
  gl.uniform1f(gl.getUniformLocation(program, name), value);
}
function setInt(gl: WebGL2RenderingContext, program: WebGLProgram, name: string, value: number): void {
  gl.uniform1i(gl.getUniformLocation(program, name), value);
}
function setVec2(gl: WebGL2RenderingContext, program: WebGLProgram, name: string, x: number, y: number): void {
  gl.uniform2f(gl.getUniformLocation(program, name), x, y);
}
function setColor(gl: WebGL2RenderingContext, program: WebGLProgram, name: string, color: string): void {
  const [r, g, b] = parseColor(color);
  gl.uniform3f(gl.getUniformLocation(program, name), r, g, b);
}
