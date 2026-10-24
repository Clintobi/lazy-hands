import { describe, expect, it } from "vitest";
import { cuesFromTextTracks, harvestCaptions } from "@/lib/page-captions";

describe("page captions", () => {
  it("prefers textTracks when they exist", () => {
    const got = harvestCaptions([
      { kind: "aria", lines: ["noisy chrome"] },
      {
        kind: "text_tracks",
        cues: [{ start: 0, end: 3, text: "A rabbit wakes." }],
      },
    ]);
    expect(got.origin).toBe("textTracks");
    expect(got.cues[0]?.text).toMatch(/rabbit/);
  });

  it("falls back to a YouTube-style caption node list", () => {
    const got = harvestCaptions([
      { kind: "text_tracks", cues: [] },
      { kind: "youtube_dom", lines: ["Dawn in a forest.", "Birds leave the branch."] },
    ]);
    expect(got.origin).toBe("youtube-dom");
    expect(got.cues).toHaveLength(2);
  });

  it("reads native cue lists", () => {
    const cues = cuesFromTextTracks([
      {
        cues: [
          { startTime: 1, endTime: 3, text: "Hello <c>world</c>" },
          null,
        ],
      },
    ]);
    expect(cues[0]?.text).toBe("Hello world");
  });
});
