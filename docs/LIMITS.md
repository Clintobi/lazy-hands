# Limits

Honest edges, not a brochure.

## Hands and face

- MediaPipe Hands and BlazeFace run in the tab. They fail in hard backlight, very low light, or when the hand leaves the frame.
- Only one hand is read. Two-handed poses are ignored.
- A swipe needs a clear lateral travel in about 280 ms. Slow waves do nothing on purpose.
- Face "away" waits about 0.9 s so a blink does not start a recap. Gaps shorter than 4 s do not summarise.

## Approvals

- One proposal at a time. A new ask waits until you approve, refuse, or the current card is gone.
- Approve and refuse need an 800 ms hold. A flick cannot buy an action.
- Actions are sandboxed: seek, captions, bookmarks, notes, a local recap. Nothing posts, emails, buys, or leaves the machine.

## Models

- Preferred: Gemma 2 2B IT, q4, through WebLLM. That needs WebGPU and a first-time download of about 1 to 2 GB of weights into the browser cache.
- This cloud VM has no `/dev/dri` and no `navigator.gpu`, even in Chromium with SwiftShader flags. Gemma therefore cannot start here. DistilBART-CNN-6-6 through transformers.js is the measured path. See docs/MODEL_RUN.md.
- If neither loads: an extractive recap from the .vtt. The card says so. Unit tests use this path on purpose.
- No caption file means no honest recap. The app will say that instead of inventing plot.

## Video

- Bundled clips are official Blender trailers, re-encoded to H.264. They are short. They are not the full films.
- Local files need a browser-playable codec. Bring your own .vtt for a recap.
- SharedArrayBuffer headers are set so WebLLM can use WebGPU. A strict embedder policy can annoy some extra origins. Sample films are same-origin.

## This is not

- Maxim Bilan's Couchmode, or any laptop-to-television agent. Different name, different job.
- A cloud assistant. There is no app server for inference.
