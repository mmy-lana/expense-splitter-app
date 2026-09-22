/**
 * Receipt capture: on-device downsampling and quality analysis.
 *
 * Two hard constraints shape this module.
 *
 * 1. MintSplit is offline-first, so a receipt never leaves the device and is
 *    stored inline as a data URL. A raw phone photo is 3–8 MB of base64, which
 *    would blow through IndexedDB quotas within a few dozen expenses; every image
 *    is therefore downsampled to fit within 800px on its longest edge and
 *    re-encoded as JPEG at quality 0.8 before it is ever persisted.
 *
 * 2. There is no OCR engine in the bundle (and no network to call one), so this
 *    module deliberately does not pretend to read text. What it *does* do is
 *    measure the image it just decoded — brightness, contrast, edge density —
 *    and tell the user whether the photo is actually legible before they attach
 *    it. That is a real, useful check, and it is honest about its limits.
 */

export const MAX_RECEIPT_EDGE = 800;
export const RECEIPT_JPEG_QUALITY = 0.8;
export const MAX_RECEIPT_INPUT_BYTES = 20 * 1024 * 1024;

export const ACCEPTED_RECEIPT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/heic',
  'image/heif',
] as const;

export interface CompressReceiptOptions {
  maxEdge?: number;
  quality?: number;
}

export interface ReceiptAnalysis {
  width: number;
  height: number;
  /** Mean luminance, 0 (black) to 255 (white). */
  brightness: number;
  /** Standard deviation of luminance: how much tonal range the image has. */
  contrast: number;
  /** Fraction of sampled pixels that sit on a strong local edge. */
  edgeDensity: number;
  /** 0–100. How likely this photo is to be legible as a document. */
  legibility: number;
  /** Actionable, human-readable guidance; empty when the image is fine. */
  advice: string[];
  verdict: 'GOOD' | 'FAIR' | 'POOR';
}

export class ReceiptProcessingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReceiptProcessingError';
  }
}

/** Rejects files that are not images or are unreasonably large, before decode. */
export function validateReceiptFile(file: File): void {
  if (!file.type.startsWith('image/')) {
    throw new ReceiptProcessingError(
      `"${file.name}" is not an image. Attach a JPEG, PNG or WebP photo of the receipt.`
    );
  }
  if (file.size > MAX_RECEIPT_INPUT_BYTES) {
    throw new ReceiptProcessingError(
      `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_RECEIPT_INPUT_BYTES / 1024 / 1024} MB.`
    );
  }
  if (file.size === 0) {
    throw new ReceiptProcessingError('That file is empty.');
  }
}

/** Loads a File into an `<img>`, rejecting if the browser cannot decode it. */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new ReceiptProcessingError(
          'That image could not be decoded. Try re-exporting it as a JPEG or PNG.'
        )
      );
    };
    image.src = url;
  });
}

/** Scales `width`/`height` down so the longest edge equals `maxEdge` at most. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number
): { width: number; height: number; scale: number } {
  const longestEdge = Math.max(width, height);
  if (longestEdge <= maxEdge || longestEdge === 0) {
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)), scale: 1 };
  }

  const scale = maxEdge / longestEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

/** Approximate decoded byte size of a base64 data URL. */
export function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  if (base64.length === 0) return 0;

  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

interface CanvasContext {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
}

function createCanvas(width: number, height: number): CanvasContext {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new ReceiptProcessingError('This browser cannot process images for receipts.');
  }

  // White base: JPEG has no alpha channel, so transparent PNGs would otherwise
  // composite onto black and become unreadable.
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, width, height);

  return { canvas, context };
}

/**
 * Downsamples a receipt photo and returns a JPEG data URL.
 *
 * The result is bounded to `maxEdge` on the longest side at quality 0.8, which
 * keeps a typical receipt near 60–120 KB — small enough to inline in IndexedDB
 * and to render instantly in the receipt viewer.
 */
export async function compressReceiptImage(
  file: File,
  options: CompressReceiptOptions = {}
): Promise<string> {
  const maxEdge = options.maxEdge ?? MAX_RECEIPT_EDGE;
  const quality = options.quality ?? RECEIPT_JPEG_QUALITY;

  if (typeof document === 'undefined') {
    throw new ReceiptProcessingError('Receipt processing requires a browser environment.');
  }

  validateReceiptFile(file);
  const image = await loadImage(file);

  const natural = {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  };
  if (natural.width === 0 || natural.height === 0) {
    throw new ReceiptProcessingError('That image has no pixels to read.');
  }

  const target = fitWithin(natural.width, natural.height, maxEdge);
  const { canvas, context } = createCanvas(target.width, target.height);

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, target.width, target.height);

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  if (!dataUrl.startsWith('data:image/jpeg')) {
    throw new ReceiptProcessingError('The receipt could not be encoded as a JPEG.');
  }

  return dataUrl;
}

/**
 * Measures a data URL's legibility as a document photo.
 *
 * Sampling is on a fixed 96×96 grid regardless of image size, so the cost is
 * constant and a 12 MP photo analyses as fast as a thumbnail.
 */
export async function analyzeReceiptImage(dataUrl: string): Promise<ReceiptAnalysis> {
  if (typeof document === 'undefined') {
    throw new ReceiptProcessingError('Receipt analysis requires a browser environment.');
  }

  const image = await loadDataUrl(dataUrl);
  const sampleSize = 96;
  const { context } = createCanvas(sampleSize, sampleSize);
  context.drawImage(image, 0, 0, sampleSize, sampleSize);

  const { data } = context.getImageData(0, 0, sampleSize, sampleSize);
  const luminance = new Float32Array(sampleSize * sampleSize);

  let sum = 0;
  for (let index = 0; index < luminance.length; index++) {
    const offset = index * 4;
    // Rec. 709 luma: matches how the eye weights the channels.
    const value = 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2];
    luminance[index] = value;
    sum += value;
  }

  const brightness = sum / luminance.length;

  let variance = 0;
  for (let index = 0; index < luminance.length; index++) {
    variance += (luminance[index] - brightness) ** 2;
  }
  const contrast = Math.sqrt(variance / luminance.length);

  // A strong local gradient means crisp text or hard edges; a soft gradient means
  // blur or an out-of-focus shot.
  let edgePixels = 0;
  for (let y = 1; y < sampleSize - 1; y++) {
    for (let x = 1; x < sampleSize - 1; x++) {
      const index = y * sampleSize + x;
      const horizontal = Math.abs(luminance[index + 1] - luminance[index - 1]);
      const vertical = Math.abs(luminance[index + sampleSize] - luminance[index - sampleSize]);
      if (horizontal + vertical > 42) edgePixels += 1;
    }
  }
  const edgeDensity = edgePixels / ((sampleSize - 2) * (sampleSize - 2));

  const advice: string[] = [];
  if (brightness < 70) advice.push('The photo looks dark — take it again in brighter, even light.');
  if (brightness > 240) advice.push('The photo looks washed out — avoid direct flash on glossy paper.');
  if (contrast < 26) advice.push('Very little contrast — the receipt may be unreadable if you need it later.');
  if (edgeDensity < 0.02) advice.push('The image looks blurry — hold the camera steady and let it focus.');

  // Weighted score: exposure and tonal range matter more than raw edge count,
  // because a clean but plain receipt legitimately has few edges.
  const exposureScore = clamp01(1 - Math.abs(brightness - 165) / 165);
  const contrastScore = clamp01(contrast / 62);
  const focusScore = clamp01(edgeDensity / 0.09);
  const legibility = Math.round((exposureScore * 0.35 + contrastScore * 0.35 + focusScore * 0.3) * 100);

  const verdict: ReceiptAnalysis['verdict'] =
    legibility >= 70 ? 'GOOD' : legibility >= 45 ? 'FAIR' : 'POOR';

  return {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
    brightness: Math.round(brightness * 10) / 10,
    contrast: Math.round(contrast * 10) / 10,
    edgeDensity: Math.round(edgeDensity * 1000) / 1000,
    legibility,
    advice,
    verdict,
  };
}

/**
 * Convenience pipeline: validate, downsample, then analyse the stored result.
 * Returns both the payload to persist and the quality report to show.
 */
export async function prepareReceipt(
  file: File,
  options: CompressReceiptOptions = {}
): Promise<{ dataUrl: string; analysis: ReceiptAnalysis; bytes: number }> {
  const dataUrl = await compressReceiptImage(file, options);
  const analysis = await analyzeReceiptImage(dataUrl);
  return { dataUrl, analysis, bytes: estimateDataUrlBytes(dataUrl) };
}

/** Human summary of an analysis, for a toast or an inline hint. */
export function describeReceiptAnalysis(analysis: ReceiptAnalysis): string {
  if (analysis.verdict === 'GOOD') {
    return `Receipt looks legible (${analysis.legibility}/100).`;
  }
  if (analysis.verdict === 'FAIR') {
    return `Receipt is readable but could be clearer (${analysis.legibility}/100). ${analysis.advice[0] ?? ''}`.trim();
  }
  return `Receipt may be hard to read later (${analysis.legibility}/100). ${analysis.advice[0] ?? 'Consider retaking the photo.'}`;
}

function loadDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new ReceiptProcessingError('That receipt image could not be decoded.'));
    image.src = dataUrl;
  });
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
