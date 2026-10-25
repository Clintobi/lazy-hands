import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pickProposal, phraseProposal, resetProposalIds } from "@/lib/proposals";
import { applyProposal, emptySandbox } from "@/lib/sandbox";
import { extractiveSummary, isUsableSummary, oneLineCommand, summariseCues } from "@/lib/summarize";
import { cuesInRange, parseVtt } from "@/lib/vtt";

describe("vtt", () => {
  it("parses the bundled Sintel captions", () => {
    const src = readFileSync("public/samples/sintel/captions.vtt", "utf8");
    const cues = parseVtt(src);
    expect(cues.length).toBeGreaterThan(4);
    const mid = cuesInRange(cues, 16, 28);
    expect(mid.some((c) => /dragon/i.test(c.text))).toBe(true);
  });
});

describe("extractive summary", () => {
  it("returns two or three sentences and reports latency", () => {
    const src = readFileSync("public/samples/bunny/captions.vtt", "utf8");
    const cues = parseVtt(src);
    const result = summariseCues(cues, 0, 33);
    const sentences = result.text.split(/(?<=[.!?])\s+/).filter(Boolean);
    expect(sentences.length).toBeGreaterThanOrEqual(2);
    expect(sentences.length).toBeLessThanOrEqual(3);
    expect(result.engine).toBe("extractive");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.note.toLowerCase()).toContain("extractive");
  });

  it("admits when a gap has no captions", () => {
    expect(extractiveSummary("")).toMatch(/no captions/i);
  });

  it("keeps the heuristic command line when models are forced off", async () => {
    const result = await oneLineCommand(
      "git push --force origin main",
      "This would overwrite remote git history.",
      { allowRemoteWeights: false },
    );
    expect(result.engine).toBe("extractive");
    expect(result.text).toMatch(/overwrite remote git history/);
  });

  it("rejects a model refusal as unusable", () => {
    expect(
      isUsableSummary("I cannot summarize the content of a text without knowing which text.", "A dragon fills the sky."),
    ).toBe(false);
    expect(isUsableSummary("A young woman walks a mountain path. A dragon fills the sky.", "captions")).toBe(true);
  });
});

describe("sandbox proposals", () => {
  it("only mutates local state", () => {
    resetProposalIds();
    const skip = phraseProposal("skip_intro", { introEnd: 8 });
    const next = applyProposal(emptySandbox(), skip);
    expect(next.seekTo).toBe(8);
    const note = applyProposal(next, phraseProposal("note_todo", { videoTime: 11 }));
    expect(note.notes).toHaveLength(1);
    expect(note.notes[0].text).toMatch(/scene/i);
  });

  it("offers skip intro early, then waits", () => {
    const first = pickProposal({
      videoTime: 2,
      duration: 33,
      captionsOn: true,
      bookmarkCount: 0,
      noteCount: 0,
      introEnd: 4.2,
      already: new Set(),
      mode: "watching",
      attention: "present",
    });
    expect(first?.kind).toBe("skip_intro");
    const blocked = pickProposal({
      videoTime: 2,
      duration: 33,
      captionsOn: true,
      bookmarkCount: 0,
      noteCount: 0,
      introEnd: 4.2,
      already: new Set(),
      mode: "approval_pending",
      attention: "present",
    });
    expect(blocked).toBeNull();
  });
});
