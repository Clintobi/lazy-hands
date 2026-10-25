import { cuesToTranscript, type Cue } from "./vtt";

export type ModelEngine = "gemma-webllm" | "distilbart" | "extractive";

export type SummaryResult = {
  text: string;
  engine: ModelEngine;
  latencyMs: number;
  note: string;
};

const GEMMA_ID = "gemma-2-2b-it-q4f16_1-MLC";
const DISTILBART_ID = "Xenova/distilbart-cnn-6-6";

export const MODEL_COPY = {
  preferred: {
    id: GEMMA_ID,
    name: "Gemma 2 2B IT (q4)",
    via: "WebLLM",
    license: "Gemma Terms of Use (Google, open weights)",
  },
  fallback: {
    id: DISTILBART_ID,
    name: "DistilBART-CNN-6-6",
    via: "transformers.js",
    license: "Apache 2.0",
  },
  last: {
    id: "extractive",
    name: "Caption extractive",
    via: "local heuristic",
    license: "this repository (MIT)",
  },
} as const;

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function extractiveSummary(transcript: string): string {
  const clean = transcript.replace(/\s+/g, " ").trim();
  if (!clean) {
    return "No captions covered that stretch, so there is nothing honest to recap.";
  }
  const sentences = splitSentences(clean);
  if (sentences.length === 0) {
    return clean.slice(0, 280);
  }
  if (sentences.length <= 3) {
    return sentences.join(" ");
  }
  const scored = sentences.map((s, i) => ({
    s,
    i,
    score: s.length + (i === 0 ? 12 : 0) + (i === sentences.length - 1 ? 8 : 0),
  }));
  scored.sort((a, b) => b.score - a.score);
  const picked = scored
    .slice(0, 3)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s);
  return picked.join(" ");
}

export function summariseCues(cues: Cue[], from: number, to: number): SummaryResult {
  const started = nowMs();
  const slice = cues.filter((c) => c.end > from && c.start < to);
  const text = extractiveSummary(cuesToTranscript(slice));
  return {
    text,
    engine: "extractive",
    latencyMs: nowMs() - started,
    note: "Extractive recap from the subtitle file. No network call.",
  };
}

type ChatEngine = {
  chat: {
    completions: {
      create: (input: {
        messages: { role: string; content: string }[];
        max_tokens?: number;
        temperature?: number;
      }) => Promise<{ choices: { message: { content: string } }[] }>;
    };
  };
};

type DistilbartRun = (text: string, opts?: { maxLength?: number; minLength?: number }) => Promise<string>;

let gemmaPromise: Promise<ChatEngine | null> | null = null;
let t5Promise: Promise<DistilbartRun | null> | null = null;

export function resetModelHandles() {
  gemmaPromise = null;
  t5Promise = null;
}

type GpuNavigator = Navigator & {
  gpu?: { requestAdapter: () => Promise<unknown> };
};

async function loadGemma(): Promise<ChatEngine | null> {
  if (typeof window === "undefined") return null;
  const gpu = (navigator as GpuNavigator).gpu;
  if (!gpu) return null;
  if (gemmaPromise) return gemmaPromise;
  gemmaPromise = (async () => {
    try {
      const adapter = await gpu.requestAdapter();
      if (!adapter) return null;
      const webllm = await import("@mlc-ai/web-llm");
      const engine = await webllm.CreateMLCEngine(GEMMA_ID, {
        initProgressCallback: () => undefined,
      });
      return engine as unknown as ChatEngine;
    } catch {
      return null;
    }
  })();
  return gemmaPromise;
}

async function loadDistilbart(): Promise<DistilbartRun | null> {
  if (t5Promise) return t5Promise;
  t5Promise = (async () => {
    try {
      const { pipeline } = await import("@huggingface/transformers");
      const pipe = await pipeline("summarization", DISTILBART_ID);
      return async (text: string, opts) => {
        const out = await pipe(text.slice(0, 2500), {
          max_length: opts?.maxLength ?? 90,
          min_length: opts?.minLength ?? 28,
        });
        const first = Array.isArray(out) ? out[0] : out;
        const rec = first as { summary_text?: string; generated_text?: string };
        return (rec.summary_text ?? rec.generated_text ?? "").trim();
      };
    } catch {
      return null;
    }
  })();
  return t5Promise;
}

function twoOrThree(text: string): string {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return text.trim();
  return sentences.slice(0, 3).join(" ");
}

function firstSentence(text: string): string {
  const sentences = splitSentences(text);
  return (sentences[0] ?? text).replace(/\s+/g, " ").trim();
}

export async function oneLineCommand(
  command: string,
  seed: string,
  opts: { allowRemoteWeights?: boolean } = {},
): Promise<SummaryResult> {
  const started = nowMs();
  const allow = opts.allowRemoteWeights !== false;
  const fallback = (seed || `A command is waiting: ${command}`).replace(/\s+/g, " ").trim();

  if (allow) {
    const gemma = await loadGemma();
    if (gemma) {
      try {
        const reply = await gemma.chat.completions.create({
          messages: [
            {
              role: "system",
              content:
                "In one short sentence, say what this shell command would do if it ran. Do not approve it. No lists. No flourish.",
            },
            { role: "user", content: command.slice(0, 500) || "empty command" },
          ],
          max_tokens: 60,
          temperature: 0.1,
        });
        const text = firstSentence(reply.choices[0]?.message?.content ?? fallback);
        if (text.length >= 12 && !/i (cannot|can't|am unable)/i.test(text)) {
          return {
            text,
            engine: "gemma-webllm",
            latencyMs: nowMs() - started,
            note: "Gemma 2 2B IT wrote this one-liner on-device through WebLLM.",
          };
        }
      } catch {
        // fall through
      }
    }

    const neural = await loadDistilbart();
    if (neural) {
      try {
        const raw = await Promise.race([
          neural(`${fallback} Pending shell command: ${command}`, { maxLength: 48, minLength: 10 }),
          new Promise<string>((_, reject) => {
            setTimeout(() => reject(new Error("distilbart-timeout")), 30_000);
          }),
        ]);
        const text = firstSentence(raw || fallback);
        if (text.length >= 12 && !/i (cannot|can't|am unable)/i.test(text)) {
          return {
            text,
            engine: "distilbart",
            latencyMs: nowMs() - started,
            note: "Gemma could not run here (no WebGPU). DistilBART-CNN-6-6 wrote this one-liner locally.",
          };
        }
      } catch {
        // fall through
      }
    }
  }

  return {
    text: fallback,
    engine: "extractive",
    latencyMs: nowMs() - started,
    note: allow
      ? "Gemma and DistilBART did not run. The heuristic line stayed."
      : "Heuristic line forced for tests.",
  };
}

export function isUsableSummary(text: string, source: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 24) return false;
  const refused = /i (cannot|can't|am unable|do not have)|please provide|as an ai|no captions covered/i;
  if (refused.test(t) && source.trim().length > 0) return false;
  return true;
}

export async function summariseGap(
  transcript: string,
  opts: { allowRemoteWeights?: boolean } = {},
): Promise<SummaryResult> {
  const started = nowMs();
  const allow = opts.allowRemoteWeights !== false;
  const fallback = extractiveSummary(transcript);

  if (allow) {
    const gemma = await loadGemma();
    if (gemma) {
      try {
        const reply = await gemma.chat.completions.create({
          messages: [
            {
              role: "system",
              content:
                "Summarise film captions in two or three plain sentences. No lists. No flourish.",
            },
            { role: "user", content: transcript.slice(0, 4000) || "No captions." },
          ],
          max_tokens: 160,
          temperature: 0.2,
        });
        const text = twoOrThree(reply.choices[0]?.message?.content ?? fallback);
        return {
          text,
          engine: "gemma-webllm",
          latencyMs: nowMs() - started,
          note: "Gemma 2 2B IT ran on-device through WebLLM.",
        };
      } catch {
        // fall through
      }
    }

    const neural = await loadDistilbart();
    if (neural) {
      try {
        const raw = await Promise.race([
          neural(transcript || "No captions."),
          new Promise<string>((_, reject) => {
            setTimeout(() => reject(new Error("distilbart-timeout")), 120_000);
          }),
        ]);
        const text = twoOrThree(raw || fallback);
        if (isUsableSummary(text, transcript)) {
          return {
            text,
            engine: "distilbart",
            latencyMs: nowMs() - started,
            note: "Gemma could not run here (no WebGPU). DistilBART-CNN-6-6 ran locally through transformers.js.",
          };
        }
      } catch {
        // fall through
      }
    }
  }

  return {
    text: fallback,
    engine: "extractive",
    latencyMs: nowMs() - started,
    note: allow
      ? "Gemma and DistilBART did not run here. This recap is extractive from the captions, still on-device."
      : "Extractive recap from the captions, forced for tests.",
  };
}

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
