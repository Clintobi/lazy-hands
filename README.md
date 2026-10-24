# Lazy Hands

A one-screen, on-device film player for people who will not pick up the remote. The webcam reads your hands and your face in the tab. An open-weight model proposes a small action and waits. A thumbs-up held for about a second says yes. An open palm held for about a second says no.

This is a new entry for the [DEV Hacktoberfest Open-Source AI Challenge Week 3: Slow and Steady](https://dev.to/challenges/hacktoberfest-week3-2026-10-19). It is not [Couchmode by Maxim Bilan](https://github.com/maximbilan/Couchmode). That project is a laptop agent that shows its work on a television. This project is a private video player with gesture approval. Different job, different code.

The product name lives in `src/lib/brand.ts`. Change it there if the title needs to move again.

## What it does

You play a local file with a `.vtt` track, or one of two bundled Blender trailers.

While you watch:

- A short open palm pauses or plays.
- A swipe left or right skips ten seconds.
- If you look away long enough, or press `M`, the app marks the time. When you come back it recaps the captions for that gap in two or three plain sentences.
- A local open model may ask one sandboxed thing at a time: skip the intro, bookmark this moment, turn captions on, recap the last stretch, or pin a note. Those actions stay in the tab. They do not post, email, buy, or call a server.

While an ask is on screen the state machine is `approval_pending`, not `watching`. A short palm no longer pauses. A thumb held ~0.8 s approves. A palm held ~0.8 s refuses. A visible ring fills so a twitch cannot commit.

Keyboard, if the camera is away: Space (watch mode only), arrows, `Y` hold to approve, `N` hold to refuse, `M` to mark a miss.

## Why open models matter here

The camera sees a living room. The captions can be a film you have not finished. A cloud API would ship both off-machine. Open weights in the browser keep the face, the hands, and the transcript on the device you already paid for. After the first weight download the recap still works on a train. There is no inference bill, and you can swap the engine in one file (`src/lib/summarize.ts`).

Closed APIs are faster to demo on a poster. They are the wrong tool for a webcam pointed at a sofa.

## Models and licences

| Piece | What we ship | Licence | Where it runs |
| --- | --- | --- | --- |
| Hand landmarker | MediaPipe Tasks Vision, `hand_landmarker.task` | Apache 2.0 (MediaPipe) | This tab |
| Face detector | MediaPipe BlazeFace short range | Apache 2.0 (MediaPipe) | This tab |
| Preferred LLM | Gemma 2 2B IT, q4, via WebLLM (`gemma-2-2b-it-q4f16_1-MLC`) | [Gemma Terms of Use](https://ai.google.dev/gemma/terms) (open weights) | This tab, WebGPU |
| Fallback LLM | DistilBART-CNN-6-6 via transformers.js | Apache 2.0 | This tab, or Node |
| Last resort | Extractive sentences from the `.vtt` | MIT, this repo | This tab, always |
| Big Buck Bunny trailer | Re-encoded official 480p trailer | CC BY 3.0, Blender Foundation | `/samples/bunny` |
| Sintel trailer | Re-encoded official 480p trailer | CC BY 3.0, Blender Foundation | `/samples/sintel` |

Gemma is the intended engine (and the honest entry for "Best Use of Gemma"). It needs WebGPU. This cloud VM has no `navigator.gpu` adapter, so WebLLM cannot start. The real measured fallback is DistilBART-CNN-6-6 through transformers.js. See [docs/MODEL_RUN.md](docs/MODEL_RUN.md). Extractive captions remain the last resort and the fast unit-test path. We do not pretend Gemma ran when it did not.

MediaPipe wasm is copied from `node_modules` on `npm install` (`scripts/copy-mediapipe.mjs`). The `.task` and `.tflite` files live in `public/models/mediapipe`.

Sample credits: `public/samples/CREDITS.md`.

## Run it

```bash
npm install
npx playwright install chromium
npm run dev
```

Open http://127.0.0.1:4521 and allow the camera, or use the keys.

```bash
npm test          # unit tests + measurements
npm run test:e2e  # Playwright, fake camera stream
npm run measure   # rewrite docs/MEASUREMENTS.md
```

## Tests and numbers

Unit tests drive recorded 21-point hand fixtures, the watching / approval state machine, false-approval rate, VTT parsing, and the extractive recap.

Playwright mocks `getUserMedia` with a canvas stream and drives `window.__lazyHands` so a CI runner does not need a sofa.

Latest fixture numbers: [docs/MEASUREMENTS.md](docs/MEASUREMENTS.md). Real on-device recap: [docs/MODEL_RUN.md](docs/MODEL_RUN.md). Limits: [docs/LIMITS.md](docs/LIMITS.md). Screenshots at 1280px sit in `docs/screenshots`. The 60 to 90s demo is `docs/demo/lazy-hands-demo.mp4`.

## Layout of the code

- `src/lib/brand.ts` : name and tagline
- `src/lib/gestures.ts` : palm, thumb, swipe
- `src/lib/session.ts` : watching vs approval_pending, hold ring, miss key
- `src/lib/proposals.ts` : closed set of local asks
- `src/lib/summarize.ts` : Gemma, DistilBART, extractive
- `src/lib/sandbox.ts` : the only place "actions" land
- `src/components/studio.tsx` : the one screen

## Challenge notes

Deadline: Mon 26 Oct 2026 07:59 WAT. This repository is the project. `DRAFT_POST.md` is a heading scaffold for Clinton's own words. The prose is not filled in.
