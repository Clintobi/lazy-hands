# Lazy Hands

A private, on-device gesture layer for **any HTML5 video**, plus a held thumbs-up before an AI action runs. Camera, hands, face, and the recap stay on the machine you already paid for.

This is a new entry for the [DEV Hacktoberfest Open-Source AI Challenge Week 3: Slow and Steady](https://dev.to/challenges/hacktoberfest-week3-2026-10-19). It is not [Couchmode by Maxim Bilan](https://github.com/maximbilan/Couchmode).

The product name lives in `src/lib/brand.ts`.

## Two surfaces

1. **Web demo** at http://127.0.0.1:4521 (bundled Blender trailers) and `/watch` (a generic journal page that is not a special player).
2. **Chrome extension** (Manifest V3) in `extension/`. Load it unpacked. The content script finds the main `<video>` on the page you are already watching.

## Gestures

- Short open palm: play or pause the main video.
- Swipe left or right: skip ten seconds.
- Look away (after a face was seen) or press `M`: mark a gap. On return, recap from page captions or a transcript if one exists.
- While an ask is on screen the machine is `approval_pending`. A short palm no longer pauses. A thumb held about 0.8s approves. A palm held about 0.8s refuses.

Keyboard, if the camera is away: Space (watch mode), arrows, `Y` / `N` on the web player, `M` to mark a miss.

## Gesture approval for AI actions

The same hold ring covers three asks, one at a time:

- In-page player asks: skip intro, captions, bookmark, recap, pin a note. Sandboxed. Nothing posts or buys.
- Agent commands: a local WebSocket bridge on `127.0.0.1:4537` plus `lazyhands approve -- <command>`. The command waits. A held thumb runs it. A held palm or a timeout leaves it unrun.
- Page confirm buttons: if a dialog exposes a clear Approve or Confirm, Lazy Hands may offer it. Destructive labels need the same hold. Chat `Send` is ignored. Nothing is clicked until a full thumbs-up.

## Why open models matter here

A webcam pointed at a sofa, plus captions from a film you have not finished, should not go to a cloud API. Gemma 2 2B IT (q4) via WebLLM is the intended engine when WebGPU exists. This VM has no `navigator.gpu`, so DistilBART-CNN-6-6 through transformers.js is what actually ran. See [docs/MODEL_RUN.md](docs/MODEL_RUN.md).

## Load the unpacked extension

```bash
npm install
npm run ext:build
```

1. Chrome → `chrome://extensions`
2. Turn on Developer mode
3. Load unpacked → choose the `extension/` folder in this repo
4. Open the toolbar popup → Wake the camera
5. Visit any page with an HTML5 video (YouTube, a local file tab, or http://127.0.0.1:4521/watch)
6. For `file://` tabs, enable "Allow access to file URLs" on the extension card

The camera runs in an offscreen extension page. Poses are messaged to the content script. Nothing is uploaded.

## Approval CLI

```bash
npm run ext:build
npm run bridge          # optional; approve will start it
node bin/lazyhands.mjs approve -- echo ship-it
```

Hold a thumbs-up in the extension overlay or on `/watch`. A palm, or a timeout, prints `Refused` and the command does not run.

## Run the web demo

```bash
npm install
npx playwright install chromium
npm run dev
```

Open http://127.0.0.1:4521 or http://127.0.0.1:4521/watch

```bash
npm test
npm run test:e2e
npm run measure
```

## What was actually tested

Tested here, in this repo:

- Unit tests for the content-script video picker on YouTube-shaped, Netflix-shaped, X-shaped, hidden, and iframe layouts
- Caption harvest from textTracks, VTT, and YouTube-style DOM nodes
- Confirm-button classifier (Approve in a dialog, ignore chat Send, mark Delete as destructive)
- Approval bridge: approve, refuse, timeout, short-thumb false positive
- Playwright: bundled player, `/watch` generic page, command-wait overlay
- DistilBART recap (real). Gemma did not start (no WebGPU)

Not tested live against production accounts:

- Logged-in Netflix (DRM player, custom captions)
- YouTube's shadow DOM captions on a real watch page
- Vimeo embeds inside a cross-origin iframe (the inner frame must be same-origin or the extension's `all_frames` script must be allowed)
- ChatGPT or Claude confirmation dialogs on the live sites (the matcher is fixture-tested)

Honest site map: [docs/LIMITS.md](docs/LIMITS.md).

## Models and licences

| Piece | What we ship | Licence | Where it runs |
| --- | --- | --- | --- |
| Hand landmarker | MediaPipe Tasks Vision | Apache 2.0 | Offscreen page or this tab |
| Face detector | MediaPipe BlazeFace | Apache 2.0 | Offscreen page or this tab |
| Preferred LLM | Gemma 2 2B IT q4 via WebLLM | Gemma Terms of Use | This machine, WebGPU |
| Fallback | DistilBART-CNN-6-6 via transformers.js | Apache 2.0 | This machine |
| Last resort | Extractive captions | MIT | This machine |
| Big Buck Bunny / Sintel trailers | Official 480p, re-encoded | CC BY 3.0, Blender Foundation | `/samples` |

## Layout

- `src/lib` : gestures, session, video finder, captions, confirm matcher, bridge protocol
- `src/extension` : MV3 background, offscreen camera, content script
- `src/bridge` : localhost WebSocket + CLI
- `src/app/watch` : generic page demo
- `extension/` : packed files you load in Chrome
