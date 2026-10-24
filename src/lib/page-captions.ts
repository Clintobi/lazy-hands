import { parseVtt, type Cue } from "./vtt";

export type CaptionSource =
  | { kind: "text_tracks"; cues: Cue[] }
  | { kind: "vtt"; text: string }
  | { kind: "youtube_dom"; lines: string[] }
  | { kind: "aria"; lines: string[] }
  | { kind: "transcript"; lines: string[] };

const RANK: CaptionSource["kind"][] = ["text_tracks", "vtt", "youtube_dom", "transcript", "aria"];

export function harvestCaptions(sources: CaptionSource[]): { cues: Cue[]; origin: string } {
  const ranked = RANK.flatMap((kind) => sources.filter((s) => s.kind === kind));
  for (const source of ranked) {
    if (source.kind === "text_tracks" && source.cues.length > 0) {
      return { cues: source.cues, origin: "textTracks" };
    }
    if (source.kind === "vtt") {
      const cues = parseVtt(source.text);
      if (cues.length > 0) return { cues, origin: "vtt" };
    }
    if (source.kind === "youtube_dom" && source.lines.some((l) => l.trim())) {
      return { cues: linesToCues(source.lines), origin: "youtube-dom" };
    }
    if (source.kind === "transcript" && source.lines.some((l) => l.trim())) {
      return { cues: linesToCues(source.lines), origin: "transcript" };
    }
    if (source.kind === "aria" && source.lines.some((l) => l.trim())) {
      return { cues: linesToCues(source.lines), origin: "aria-live" };
    }
  }
  return { cues: [], origin: "none" };
}

function linesToCues(lines: string[]): Cue[] {
  const clean = lines.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  return clean.map((text, i) => ({ start: i * 2, end: i * 2 + 2, text }));
}

export function cuesFromTextTracks(tracks: ArrayLike<{ cues?: ArrayLike<unknown> | null }>): Cue[] {
  const out: Cue[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const list = tracks[i]?.cues;
    if (!list) continue;
    for (let j = 0; j < list.length; j++) {
      const cue = list[j] as { startTime?: number; endTime?: number; text?: string } | null;
      if (!cue) continue;
      const text = String(cue.text ?? "")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (text) out.push({ start: Number(cue.startTime ?? 0), end: Number(cue.endTime ?? 0), text });
    }
  }
  return out;
}

export function collectDomCaptionLines(
  nodes: ArrayLike<{ textContent?: string | null }>,
): string[] {
  return Array.from(nodes)
    .map((n) => (n.textContent ?? "").replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 0);
}
