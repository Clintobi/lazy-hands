export type Cue = {
  start: number;
  end: number;
  text: string;
};

function parseStamp(raw: string): number {
  const clean = raw.trim().replace(",", ".");
  const parts = clean.split(":");
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return Number(h) * 3600 + Number(m) * 60 + Number(s);
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    return Number(m) * 60 + Number(s);
  }
  return Number(clean);
}

export function parseVtt(source: string): Cue[] {
  const blocks = source.replace(/^\uFEFF/, "").split(/\r?\n\r?\n/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) continue;
    if (lines[0].startsWith("WEBVTT")) continue;
    const timeLine = lines.find((l) => l.includes("-->"));
    if (!timeLine) continue;
    const [startRaw, endRaw] = timeLine.split("-->");
    const start = parseStamp(startRaw);
    const end = parseStamp((endRaw ?? "").trim().split(/\s+/)[0] ?? "");
    const text = lines
      .filter((l) => l !== timeLine && !/^\d+$/.test(l.trim()))
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (Number.isFinite(start) && Number.isFinite(end) && text) {
      cues.push({ start, end, text });
    }
  }
  return cues;
}

export function cuesInRange(cues: Cue[], start: number, end: number): Cue[] {
  const a = Math.min(start, end);
  const b = Math.max(start, end);
  return cues.filter((c) => c.end > a && c.start < b);
}

export function cuesToTranscript(cues: Cue[]): string {
  return cues
    .map((c) => c.text.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
}
