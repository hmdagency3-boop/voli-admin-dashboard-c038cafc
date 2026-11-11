import { drawSoftFrame, edgeMask, type EdgeSettings } from '@/lib/video-edges';

/**
 * Entrance (ride) pictures: always square, with the same soft transparent edges as the videos.
 * Done in the admin's browser before upload; the result is a PNG.
 */
export type SquareFit = 'cover' | 'contain';
export const IMAGE_MAX_SIDE = 1024;

/** Where the picture lands inside a size×size square: cover = crop the middle, contain = whole picture with see-through margins. */
export function squareLayout(w: number, h: number, fit: SquareFit, max = IMAGE_MAX_SIDE) {
  const size = Math.max(2, Math.min(max, fit === 'cover' ? Math.min(w, h) : Math.max(w, h)));
  const k = fit === 'cover' ? size / Math.min(w, h) : size / Math.max(w, h);
  const dw = w * k, dh = h * k;
  return { size, x: (size - dw) / 2, y: (size - dh) / 2, w: dw, h: dh };
}

export const isSquare = (w: number, h: number) => w > 0 && Math.abs(w - h) <= 1;
export const isAnimated = (file: { type: string }) => file.type === 'image/gif';

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(Object.assign(new Error('تعذّر قراءة الصورة في المتصفح'), { hint: 'bad_art_file' }));
    img.src = src;
  });
}

/** Draws the square, softened picture on a canvas of size×size. */
export function drawSoftSquare(canvas: HTMLCanvasElement, img: HTMLImageElement, fit: SquareFit, s: EdgeSettings, max = IMAGE_MAX_SIDE) {
  const L = squareLayout(img.naturalWidth, img.naturalHeight, fit, max);
  canvas.width = L.size; canvas.height = L.size;
  const tmp = document.createElement('canvas');
  tmp.width = L.size; tmp.height = L.size;
  tmp.getContext('2d')!.drawImage(img, L.x, L.y, L.w, L.h);
  drawSoftFrame(canvas.getContext('2d')!, tmp, edgeMask(L.size, L.size, s), L.size, L.size);
}

export async function softenImageEdges(file: File, fit: SquareFit, s: EdgeSettings): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    drawSoftSquare(canvas, img, fit, s);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) throw Object.assign(new Error('تعذّر تجهيز الصورة'), { hint: 'bad_art_file' });
    const base = file.name.replace(/\.[^.]+$/, '') || 'ride';
    return new File([blob], `${base}-square.png`, { type: 'image/png' });
  } finally { URL.revokeObjectURL(url); }
}
