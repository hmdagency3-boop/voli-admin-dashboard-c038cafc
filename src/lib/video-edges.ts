import fixWebmDuration from 'fix-webm-duration';

/**
 * Soft (feathered) edges for store videos, done in the admin's browser before upload: every frame is
 * drawn on a canvas, its four edges fade to transparent, and the result is recorded as WebM with alpha.
 */
export type EdgeShape = 'rect' | 'oval';
export type EdgeSettings = { feather: number; shape: EdgeShape };
/** Feather is a percent of the video's shorter side (rect) or of its radius ×2 (oval). */
export const FEATHER_MAX = 45;
export const EDGE_DEFAULT: EdgeSettings = { feather: 12, shape: 'rect' };
export const EDGE_MAX_SIDE = 1080;

const clamp01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t);
const smooth = (t: number) => { const x = clamp01(t); return x * x * (3 - 2 * x); };

/** Opacity (0..1) of the pixel at x,y in a w×h frame: 0 on the border, 1 inside the feathered band. */
export function edgeAlpha(x: number, y: number, w: number, h: number, s: EdgeSettings): number {
  const feather = Math.min(FEATHER_MAX, Math.max(0, s.feather));
  if (feather <= 0) return 1;
  if (s.shape === 'oval') {
    const d = Math.hypot((x - w / 2) / (w / 2), (y - h / 2) / (h / 2));
    const f = Math.min(1, (feather / 100) * 2);
    return 1 - smooth((d - (1 - f)) / f);
  }
  const f = (feather / 100) * Math.min(w, h);
  return smooth(Math.min(x, w - x) / f) * smooth(Math.min(y, h - y) / f);
}

/** Output size: same shape, longest side at most `max`, even numbers (needed by video encoders). */
export function outputSize(w: number, h: number, max = EDGE_MAX_SIDE): { width: number; height: number } {
  const k = Math.min(1, max / Math.max(w, h, 1));
  const even = (n: number) => Math.max(2, Math.round((n * k) / 2) * 2);
  return { width: even(w), height: even(h) };
}

/** Canvas whose alpha channel is the edge mask (drawn with destination-in over each frame). */
export function edgeMask(w: number, h: number, s: EdgeSettings): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(edgeAlpha(x + 0.5, y + 0.5, w, h, s) * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Draws one masked frame. */
export function drawSoftFrame(g: CanvasRenderingContext2D, src: CanvasImageSource, mask: HTMLCanvasElement, w: number, h: number) {
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, w, h);
  g.drawImage(src, 0, 0, w, h);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(mask, 0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
}

function recorderType(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return null;
  return ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8']
    .find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}
/** Chrome / Edge / Firefox can make transparent edges; Safari cannot. */
export const softEdgesSupported = () => typeof window !== 'undefined' && recorderType() !== null;

const once = (el: HTMLMediaElement, ev: string) => new Promise<void>((res, rej) => {
  const ok = () => { el.removeEventListener('error', bad); res(); };
  const bad = () => { el.removeEventListener(ev, ok); rej(Object.assign(new Error('تعذّر قراءة الفيديو في المتصفح'), { hint: 'bad_video_file' })); };
  el.addEventListener(ev, ok, { once: true });
  el.addEventListener('error', bad, { once: true });
});

/**
 * Plays the video once (real time) through the edge mask and records it with its sound.
 * Returns a new .webm File with transparent, soft edges.
 */
export async function softenVideoEdges(file: File, s: EdgeSettings, onProgress?: (percent: number) => void, signal?: AbortSignal): Promise<File> {
  const mime = recorderType();
  if (!mime) throw Object.assign(new Error('soft_edges_unsupported'), { hint: 'soft_edges_unsupported' });
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.playsInline = true; video.preload = 'auto'; video.src = url;
  let audio: AudioContext | null = null;
  let stream: MediaStream | null = null;
  try {
    await once(video, 'loadeddata');
    const { width, height } = outputSize(video.videoWidth, video.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const g = canvas.getContext('2d', { alpha: true })!;
    const mask = edgeMask(width, height, s);
    video.currentTime = 0;
    drawSoftFrame(g, video, mask, width, height);

    stream = canvas.captureStream(30);
    try {
      audio = new AudioContext();
      await audio.resume();
      const dest = audio.createMediaStreamDestination();
      audio.createMediaElementSource(video).connect(dest); // not connected to speakers: silent for the admin
      dest.stream.getAudioTracks().forEach((t) => stream!.addTrack(t));
    } catch { /* no sound track: keep video only */ }

    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 128_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise<void>((res) => { rec.onstop = () => res(); });

    let done = false;
    const frame = () => {
      if (done) return;
      drawSoftFrame(g, video, mask, width, height);
      if (video.duration) onProgress?.(Math.min(99, Math.floor((video.currentTime / video.duration) * 100)));
      if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(frame);
      else requestAnimationFrame(frame);
    };
    const ended = once(video, 'ended');
    const aborted = new Promise<never>((_, rej) => signal?.addEventListener('abort', () => rej(Object.assign(new Error('cancelled'), { hint: 'cancelled' })), { once: true }));
    rec.start(250);
    await video.play();
    frame();
    try {
      await Promise.race([ended, aborted]);
    } finally {
      done = true;
      video.pause();
      drawSoftFrame(g, video, mask, width, height);
      await new Promise((r) => setTimeout(r, 120));
      rec.stop();
      await stopped;
    }
    const raw = new Blob(chunks, { type: 'video/webm' });
    const fixed = await fixWebmDuration(raw, Math.round(video.duration * 1000), { logger: false });
    onProgress?.(100);
    const base = file.name.replace(/\.[^.]+$/, '') || 'video';
    return new File([fixed], `${base}-soft.webm`, { type: 'video/webm' });
  } finally {
    stream?.getTracks().forEach((t) => t.stop());
    audio?.close().catch(() => {});
    video.removeAttribute('src'); video.load();
    URL.revokeObjectURL(url);
  }
}
