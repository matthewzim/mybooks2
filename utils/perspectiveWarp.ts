/**
 * Perspective (homography) image warp using expo-gl.
 *
 * Takes four independently-placed corners of a quadrilateral in a source image
 * and warps that quadrilateral onto a straight, axis-aligned rectangle — the
 * classic "de-skew a photo taken at an angle" transform. Unlike a bounding-box
 * crop, this honors each corner exactly: a spine photographed at an angle comes
 * out as a clean upright rectangle.
 *
 * It renders headlessly (no on-screen GLView) into an offscreen framebuffer and
 * snapshots it to a JPEG file, so it can be called from anywhere.
 */

// `expo-gl` is a native module, so importing it eagerly throws at module-load
// time ("Cannot find native module 'ExpoGL'") whenever the app binary wasn't
// rebuilt after expo-gl was added. That throw would cascade up the import chain
// (SpineCropper -> CameraScanner -> app/scan.tsx) and take the whole Scan route
// down. Worse, a bare `require('expo-gl')` in a build without the module logs a
// red "Cannot find native module 'ExpoGL'" error even when the throw is caught.
//
// So we (a) probe for the native module with expo-modules-core's
// `requireOptionalNativeModule`, which returns null instead of throwing (and
// logs nothing) when the module is missing, and (b) only `require('expo-gl')`
// once that probe confirms it is present. Callers check
// `isPerspectiveWarpAvailable()` and fall back to a plain bounding-box crop when
// the warp isn't available. The `expo-gl` types are imported with `import type`,
// which is erased at build time and never triggers the native module lookup.
import { requireOptionalNativeModule } from 'expo-modules-core';
import * as ImageManipulator from 'expo-image-manipulator';
import type { ExpoWebGLRenderingContext } from 'expo-gl';

// The static (constructor) side of GLView, resolved purely at the type level so
// this line emits no runtime `require` of the native module.
type GLViewStatic = typeof import('expo-gl').GLView;

let cachedGLView: GLViewStatic | null = null;
let glModuleAvailable: boolean | null = null;

/**
 * Whether expo-gl's native module ("ExpoGL") is present in this build.
 *
 * Uses the optional native-module lookup, which returns null instead of throwing
 * when the module is missing, so probing never logs the red "Cannot find native
 * module 'ExpoGL'" error that a bare `require('expo-gl')` would. The result is
 * cached, and callers use it to decide whether to attempt a perspective warp or
 * skip straight to a plain crop.
 */
export function isPerspectiveWarpAvailable(): boolean {
  if (glModuleAvailable === null) {
    try {
      glModuleAvailable = requireOptionalNativeModule('ExpoGL') != null;
    } catch {
      glModuleAvailable = false;
    }
  }
  return glModuleAvailable;
}

/**
 * Resolve expo-gl's GLView at call time. Throws (rather than crashing at import)
 * if the native module isn't in this build, so callers can fall back to a crop.
 * `expo-gl` is only required once the native module is confirmed present, so the
 * throwing require is never reached — and never logs — in a build without it.
 */
function getGLView(): GLViewStatic {
  if (cachedGLView) return cachedGLView;
  if (!isPerspectiveWarpAvailable()) {
    throw new Error("Native module 'ExpoGL' is unavailable in this build");
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('expo-gl') as typeof import('expo-gl');
  if (!mod?.GLView) {
    throw new Error("Native module 'ExpoGL' is unavailable in this build");
  }
  cachedGLView = mod.GLView;
  return cachedGLView;
}

export interface WarpPoint {
  x: number;
  y: number;
}

export interface WarpParams {
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
  /** Quad corners in image pixel coordinates, ordered TL, TR, BR, BL. */
  corners: [WarpPoint, WarpPoint, WarpPoint, WarpPoint];
}

/** Largest output edge we render, to keep the framebuffer a sane size. */
const MAX_OUTPUT_DIMENSION = 2000;

/**
 * Fallback for GL_MAX_TEXTURE_SIZE when the driver can't report it. 2048 is the
 * smallest limit in common use, so it's the safe assumption.
 */
const FALLBACK_MAX_TEXTURE_SIZE = 2048;

/**
 * Normalize the source image before it becomes a GL texture:
 *
 *  - Downscale it to fit within `maxEdge` (the GPU's max texture size). A raw
 *    phone photo is often 3000–4000px on its long edge, which overflows the
 *    texture limit on many devices; `texImage2D` then fails and the whole warp
 *    throws, sending the caller to a bounding-box crop that includes everything
 *    beside a slanted spine. Downscaling keeps the upload valid.
 *  - Re-encode it, which bakes in any EXIF orientation flag. expo-image reports
 *    EXIF-corrected dimensions (so the on-screen corners live in that space),
 *    but expo-gl uploads the raw pixels; an unbaked orientation flag would make
 *    the texture sample the wrong region. Re-encoding removes the flag so the
 *    texture matches the corner coordinate system.
 *
 * Corners are normalized to 0..1 by the caller, so a uniform downscale doesn't
 * change the homography.
 *
 * If normalization fails this throws rather than falling back to the original
 * URI: expo-gl decodes textures with stb_image, which ignores EXIF orientation
 * and silently produces an empty texture for oversized or non-file:// sources
 * (glTexImage2D with null data is a legal call, so nothing throws). Uploading
 * the raw original would therefore not fail loudly — it would "succeed" with a
 * black or wrong-region result, which is worse than the caller's bounding-box
 * fallback (orientation-aware, correct region).
 */
async function prepareSourceForTexture(
  imageUri: string,
  imageWidth: number,
  imageHeight: number,
  maxEdge: number
): Promise<string> {
  const longest = Math.max(imageWidth, imageHeight);
  // Resize by the longer edge so the shorter one scales proportionally.
  const resizeAction =
    imageWidth >= imageHeight
      ? { resize: { width: maxEdge } }
      : { resize: { height: maxEdge } };
  const actions = longest > maxEdge ? [resizeAction] : [];

  try {
    const result = await ImageManipulator.manipulateAsync(imageUri, actions, {
      compress: 1,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return result.uri;
  } catch (error) {
    throw new Error(`Failed to normalize source image for warp: ${error}`);
  }
}

const VERTEX_SHADER = `
attribute vec2 aPos;
attribute vec2 aUV;
varying vec2 vUV;
void main() {
  vUV = aUV;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUV;
uniform sampler2D uTex;
uniform mat3 uH;
void main() {
  // Map the output pixel (vUV, top-left origin) back into the source image
  // through the homography, then sample. The divide by p.z is what makes the
  // mapping a true perspective transform rather than an affine stretch.
  vec3 p = uH * vec3(vUV, 1.0);
  vec2 uv = p.xy / p.z;
  gl_FragColor = texture2D(uTex, uv);
}
`;

function distance(a: WarpPoint, b: WarpPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Homography mapping the output unit square (0..1, top-left origin) onto the
 * source quad given in normalized (0..1) image coordinates.
 *
 * Corner assignment: (0,0)->TL, (1,0)->TR, (1,1)->BR, (0,1)->BL. Returns the
 * 3x3 matrix in row-major order [a,b,c, d,e,f, g,h,1] such that
 *   s = (a*u + b*v + c) / (g*u + h*v + 1)
 *   t = (d*u + e*v + f) / (g*u + h*v + 1)
 * (the standard Heckbert unit-square-to-quad construction).
 */
function squareToQuad(
  p0: WarpPoint,
  p1: WarpPoint,
  p2: WarpPoint,
  p3: WarpPoint
): number[] {
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;

  const EPS = 1e-10;
  let a: number, b: number, c: number, d: number, e: number, f: number;
  let g = 0;
  let h = 0;

  if (Math.abs(sx) < EPS && Math.abs(sy) < EPS) {
    // Affine (the quad is a parallelogram) — no perspective terms.
    a = p1.x - p0.x;
    b = p2.x - p1.x;
    c = p0.x;
    d = p1.y - p0.y;
    e = p2.y - p1.y;
    f = p0.y;
  } else {
    const dx1 = p1.x - p2.x;
    const dx2 = p3.x - p2.x;
    const dy1 = p1.y - p2.y;
    const dy2 = p3.y - p2.y;
    const denom = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / denom;
    h = (dx1 * sy - sx * dy1) / denom;
    a = p1.x - p0.x + g * p1.x;
    b = p3.x - p0.x + h * p3.x;
    c = p0.x;
    d = p1.y - p0.y + g * p1.y;
    e = p3.y - p0.y + h * p3.y;
    f = p0.y;
  }

  return [a, b, c, d, e, f, g, h, 1];
}

function compileShader(
  gl: ExpoWebGLRenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Unable to create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${info}`);
  }
  return shader;
}

/**
 * Warp the quad defined by `corners` into an upright rectangle and return the
 * file URI of the resulting JPEG. Throws if the GL pipeline fails, so callers
 * can fall back to a plain crop.
 */
export async function warpPerspective(params: WarpParams): Promise<string> {
  const { imageUri, imageWidth, imageHeight, corners } = params;
  const [tl, tr, br, bl] = corners;

  // Homography from output unit square -> source quad in normalized coords.
  // This works in 0..1 space, so it's independent of the source's pixel size
  // (and therefore unaffected by the downscale applied below).
  const norm = (p: WarpPoint): WarpPoint => ({
    x: p.x / imageWidth,
    y: p.y / imageHeight,
  });
  const m = squareToQuad(norm(tl), norm(tr), norm(br), norm(bl));
  // WebGL wants column-major; transpose the row-major matrix above.
  const columnMajor = [
    m[0], m[3], m[6],
    m[1], m[4], m[7],
    m[2], m[5], m[8],
  ];

  // Resolve GLView now; if the native module is missing this throws and the
  // caller (SpineCropper) falls back to a bounding-box crop.
  const GLView = getGLView();
  const gl = await GLView.createContextAsync();
  let program: WebGLProgram | null = null;
  try {
    // The GPU's texture-size ceiling bounds both the source we can upload and
    // the framebuffer we can render into. Overshooting it makes texImage2D fail
    // and the warp throw — which is what silently drops us to the bounding-box
    // fallback that pulls in content beside a slanted spine.
    const maxTextureSize =
      gl.getParameter(gl.MAX_TEXTURE_SIZE) || FALLBACK_MAX_TEXTURE_SIZE;

    // Output size: use the longer of each pair of opposite edges so we don't
    // lose resolution, capped so the framebuffer stays within both our sane
    // limit and the GPU's texture ceiling.
    const outputCap = Math.min(MAX_OUTPUT_DIMENSION, maxTextureSize);
    const rawWidth = Math.max(distance(tl, tr), distance(bl, br));
    const rawHeight = Math.max(distance(tl, bl), distance(tr, br));
    const longest = Math.max(rawWidth, rawHeight);
    const scale = longest > outputCap ? outputCap / longest : 1;
    const outWidth = Math.max(1, Math.round(rawWidth * scale));
    const outHeight = Math.max(1, Math.round(rawHeight * scale));

    // Normalize the source (bake EXIF orientation, fit the texture ceiling)
    // before uploading it.
    const sourceUri = await prepareSourceForTexture(
      imageUri,
      imageWidth,
      imageHeight,
      maxTextureSize
    );

    // --- Source texture (loaded natively from the file URI) ---
    const srcTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, srcTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      // expo-gl loads the image from a file:// URI passed as `localUri`.
      { localUri: sourceUri } as unknown as HTMLImageElement
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // --- Offscreen framebuffer at the output size ---
    const targetTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, targetTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      outWidth,
      outHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      targetTexture,
      0
    );
    gl.viewport(0, 0, outWidth, outHeight);

    // --- Program ---
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    program = gl.createProgram();
    if (!program) throw new Error('Unable to create program');
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`);
    }
    gl.useProgram(program);

    // --- Full-screen quad: clip-space position + output UV (top-left origin) ---
    // aUV.y grows downward while clip y grows upward, so the sampled source
    // matches the corner order (TL..BL): the TL corner is drawn at the top of
    // the viewport. See the snapshot call below for how that reaches the file.
    const vertices = new Float32Array([
      -1, 1, 0, 0,
      1, 1, 1, 0,
      1, -1, 1, 1,
      -1, 1, 0, 0,
      1, -1, 1, 1,
      -1, -1, 0, 1,
    ]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const stride = 4 * Float32Array.BYTES_PER_ELEMENT;
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
    const aUV = gl.getAttribLocation(program, 'aUV');
    gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTexture);
    gl.uniform1i(gl.getUniformLocation(program, 'uTex'), 0);
    gl.uniformMatrix3fv(gl.getUniformLocation(program, 'uH'), false, columnMajor);

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.flush();
    gl.endFrameEXP();

    // `flip: false` is what produces an upright image here, despite the name.
    // glReadPixels returns rows bottom-up, so the raw readback is upside down,
    // and expo-gl's `flip` option selects whether that gets corrected:
    //  - iOS draws the readback into a UIGraphics image context, whose CTM is
    //    already y-flipped; CGContextDrawImage therefore un-flips the rows on
    //    its own, and `flip: true` adds a second flip that cancels it out.
    //  - Android applies its un-flip matrix in the `if (!flip)` branch.
    // On both platforms `flip: true` leaves the output mirrored top-to-bottom
    // (which read as a spine that was flipped both ways once the mirrored text
    // was rotated), so this must stay false.
    const snapshot = await GLView.takeSnapshotAsync(gl, {
      framebuffer,
      rect: { x: 0, y: 0, width: outWidth, height: outHeight },
      flip: false,
      format: 'jpeg',
      compress: 0.9,
    });

    const uri = typeof snapshot.uri === 'string' ? snapshot.uri : (snapshot.uri as any)?.uri;
    if (!uri) throw new Error('Snapshot returned no URI');
    return uri;
  } finally {
    await GLView.destroyContextAsync(gl).catch(() => {});
  }
}
