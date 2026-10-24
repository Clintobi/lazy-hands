export type VideoShape = {
  id?: string;
  className?: string;
  src?: string;
  currentSrc?: string;
  clientWidth: number;
  clientHeight: number;
  videoWidth?: number;
  videoHeight?: number;
  duration: number;
  currentTime: number;
  paused: boolean;
  ended: boolean;
  muted?: boolean;
  readyState: number;
  hidden?: boolean;
  display?: string;
  visibility?: string;
  opacity?: number;
  ariaHidden?: boolean;
  inIframe?: boolean;
  hasControls?: boolean;
  hostHint?: string;
};

export function scoreVideo(video: VideoShape): number {
  if (video.hidden) return -1;
  if (video.display === "none") return -1;
  if (video.visibility === "hidden") return -1;
  if ((video.opacity ?? 1) < 0.08) return -1;
  if (video.ariaHidden) return -1;
  if (video.ended && video.paused) return -1;

  const width = video.clientWidth || video.videoWidth || 0;
  const height = video.clientHeight || video.videoHeight || 0;
  if (width < 140 || height < 90) return -1;

  let score = width * height;
  if (!video.paused) score *= 1.45;
  if (video.duration >= 20) score *= 1.2;
  if (video.readyState >= 2) score *= 1.1;
  if (video.hasControls) score *= 1.05;
  if (video.inIframe) score *= 0.82;

  const cls = `${video.id ?? ""} ${video.className ?? ""}`.toLowerCase();
  if (/html5-main-video|video-stream|movie_player|watch-video|vp-video|r-1/.test(cls)) score *= 1.55;
  if (/preview|thumbnail|ad-|adsbox|miniplayer|pip/.test(cls) && width < 480) score *= 0.25;

  const host = (video.hostHint ?? "").toLowerCase();
  if (host.includes("youtube") && /html5-main-video|video-stream/.test(cls)) score *= 1.2;
  if (host.includes("netflix") && width >= 640) score *= 1.15;
  if (host.includes("vimeo") && width >= 480) score *= 1.1;
  if ((host.includes("x.com") || host.includes("twitter")) && width >= 300) score *= 1.05;

  return score;
}

export function pickMainVideo<T extends VideoShape>(videos: T[]): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const video of videos) {
    const score = scoreVideo(video);
    if (score > bestScore) {
      best = video;
      bestScore = score;
    }
  }
  return best;
}

export function shapeFromElement(
  el: {
    id?: string;
    className?: string | { toString(): string };
    src?: string;
    currentSrc?: string;
    clientWidth: number;
    clientHeight: number;
    videoWidth?: number;
    videoHeight?: number;
    duration: number;
    currentTime: number;
    paused: boolean;
    ended: boolean;
    muted?: boolean;
    readyState: number;
    hidden?: boolean;
    controls?: boolean;
    getAttribute?: (name: string) => string | null;
  },
  extras: Partial<VideoShape> = {},
): VideoShape {
  return {
    id: el.id,
    className: typeof el.className === "string" ? el.className : el.className?.toString(),
    src: el.src,
    currentSrc: el.currentSrc,
    clientWidth: el.clientWidth,
    clientHeight: el.clientHeight,
    videoWidth: el.videoWidth,
    videoHeight: el.videoHeight,
    duration: Number.isFinite(el.duration) ? el.duration : 0,
    currentTime: el.currentTime,
    paused: el.paused,
    ended: el.ended,
    muted: el.muted,
    readyState: el.readyState,
    hidden: el.hidden,
    hasControls: el.controls,
    ariaHidden: el.getAttribute?.("aria-hidden") === "true",
    ...extras,
  };
}

export function collectVideosFromDocument(
  doc: {
    querySelectorAll: (sel: string) => ArrayLike<{
      id?: string;
      className?: string;
      src?: string;
      currentSrc?: string;
      clientWidth: number;
      clientHeight: number;
      videoWidth?: number;
      videoHeight?: number;
      duration: number;
      currentTime: number;
      paused: boolean;
      ended: boolean;
      muted?: boolean;
      readyState: number;
      hidden?: boolean;
      controls?: boolean;
      getAttribute?: (name: string) => string | null;
    }>;
  },
  extras: Partial<VideoShape> = {},
) {
  return Array.from(doc.querySelectorAll("video")).map((el) => shapeFromElement(el, extras));
}
