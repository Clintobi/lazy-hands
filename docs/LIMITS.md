# Limits

Honest edges, not a brochure.

## Hands and face

- MediaPipe Hands and BlazeFace run in the tab or in the extension offscreen page. They fail in hard backlight, very low light, or when the hand leaves the frame.
- Only one hand is read. Two-handed poses are ignored.
- A swipe needs a clear lateral travel in about 280 ms. Slow waves do nothing on purpose.
- Face "away" waits about 0.9 s so a blink does not start a recap. Gaps shorter than 4 s do not summarise.

## Any page, any video

- The content script looks for HTML5 `<video>` nodes. It scores size, visibility, playing state, and a few host class names (YouTube `html5-main-video`, Netflix player view, X clips).
- Cross-origin iframes: the script runs in `all_frames` where Chrome allows it. A player that never exposes a same-frame `<video>` cannot be driven.
- YouTube: play, pause, and seek usually work on the main HTML5 element. Captions often live in custom DOM, not `textTracks`. The recap uses whatever track or caption nodes we can read. Not live-tested on a signed-in watch page in this VM.
- Netflix: the media element exists, but DRM and custom captions mean play/pause/seek may work while "what did I miss" may be empty. Not live-tested on a real account.
- Vimeo: first-party pages are fine. Embedded iframes from another origin are limited.
- X / Twitter: in-timeline HTML5 clips can be picked when they are large enough. Autoplay tiles are ignored.
- `file://` local files need "Allow access to file URLs" on the extension card.
- Sites that replace the media element every few seconds may drop the binding until the next scan (about 1.5 s).

## Approvals

- One proposal at a time. A new ask waits until you approve, refuse, or the current card times out.
- Approve and refuse need a held pose. A flick cannot buy an action.
- Hold length follows risk: 800 ms for low-risk player asks and `echo`/`git status`, 1200 ms for unknown commands, 1800 ms for high risk (`git push`, `sudo`), 2400 ms for critical (`rm -rf`, `git push --force`, `npm publish`). Timeout or palm still refuses.
- Player actions stay sandboxed: seek, captions, bookmarks, notes, a local recap.
- Agent commands run only after a held thumb on the local bridge. The default is refuse (palm or timeout). A one-line local risk blurb prints before the thumb. The heuristic owns the tier. Gemma or DistilBART may rewrite the sentence; they never auto-allow.
- Page confirm buttons are offered only when the matcher is sure. Chat Send is ignored. Yes, OK, and cookie Accept stay ignored unless they sit in a dialog. Destructive labels still need a hold. Nothing is clicked without that hold.
- Agent asks from the CLI show on the focused Chrome tab (or on `/watch` if that page is open). The bridge listens on 127.0.0.1 only.

## Models

- Preferred: Gemma 2 2B IT, q4, through WebLLM. That needs WebGPU and a first-time download of about 1 to 2 GB of weights into the browser cache.
- This cloud VM has no `/dev/dri` and no `navigator.gpu`, even in Chromium with SwiftShader flags. Gemma therefore cannot start here. DistilBART-CNN-6-6 through transformers.js is the measured path. See docs/MODEL_RUN.md.
- If neither loads: an extractive recap from captions. The card says so. Unit tests use this path on purpose.
- No caption file and no on-page transcript means no honest recap. The app will say that instead of inventing plot.

## Video samples

- Bundled clips are official Blender trailers, re-encoded to H.264. They are short. They are not the full films.
- Local files need a browser-playable codec. Bring your own captions for a recap.

## This is not

- Maxim Bilan's Couchmode, or any laptop-to-television agent. Different name, different job.
- A cloud assistant. There is no app server for inference.
- A license to auto-click payments or deletes. Those still wait for a held thumb, and chat Send is never treated as consent.
