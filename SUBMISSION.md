---
title: "The sofa veto: I approve films and agent commands with a thumb, and a force-push has to wait"
published: false
tags: devchallenge, hf26challenge
---

This is a submission for the Hacktoberfest Open-Source AI Challenge: Week 3, Slow and Steady.

I watch films from a sofa that already ate the remote. I also leave coding agents running while I do that. Both of those habits needed the same lazy rule: the machine may ask, and I answer with a thumb, and nothing dangerous gets a cheap flick.

# What I Built

Lazy Hands is a Chrome extension plus a tiny localhost CLI. The extension finds the main HTML5 video on whatever page I already opened, reads my hand and my face on this machine, and waits. Palm pauses. A swipe skips ten seconds. If I look away long enough, it recaps from captions when I come back. When something wants consent, the machine switches to `approval_pending` and a hold ring fills. A thumb held to the end approves. A palm held to the end refuses. A timeout refuses. A twitch does nothing.

The lazy payoff is that I can stay on the sofa for two jobs that used to make me lean forward. I can drive a film without finding the remote. I can let a coding agent wait on `lazyhands approve -- git push --force origin main` without walking back to the keyboard. The command sits there. The overlay says CRITICAL and prints one plain line about overwriting remote history. I have to hold the thumb for 2.4 seconds. `echo ship-it` still waits, but only 0.8 seconds, and the line says it looks like a read or print.

I wanted approval to feel like a veto, not a settings wall. There is no auto-allow list. There is no "always run git". [GestureApprove](https://github.com/tankxu/gesture-approve) on macOS already does thumbs-up for Claude Code, and it can skip safe commands with an optional local model. I went the other way. The model is allowed to explain the command in one sentence. It is not allowed to wave the command through. The heuristic owns the risk tier. Gemma or DistilBART may rewrite the sentence. They never change the hold, and they never run the shell.

The Chrome extension is the real product surface. It is not locked to the bundled player. Load `extension/` unpacked, wake the camera from the popup, and open YouTube, a `file://` tab, Vimeo, or the generic journal page at `/watch`. The content script scores HTML5 `<video>` nodes the way a person would: size, visibility, playing state, a few host class names. MediaPipe runs in an offscreen page so the tab only receives poses.

The CLI is the same hold ring for a coding agent. `node bin/lazyhands.mjs approve -- <command>` starts a WebSocket on `127.0.0.1:4537` if it is not already up. The command is printed with its risk line. The extension or `/watch` shows the card. A held thumb runs the argv. A held palm, or a timeout, prints `Refused` and the process exits. I think a coding agent should wait. I do not think it should get a faster path because the model sounded calm.

This is a new project. It is not [Couchmode](https://github.com/maximbilan/Couchmode) by Maxim Bilan. Couchmode is a Fire TV ACP client. Lazy Hands is a browser gesture layer and a local approve gate.

# Demo

There is no hosted YouTube URL. The recordings are local files in the repo. `npm run demo` and `npm run demo:any` rebuild them with Playwright against the bundled Blender trailers. A live webcam take from a Mac was not recorded for this post.

**Recordings**

- Player flow (idle, palm, hold ring, miss card): [docs/demo/lazy-hands-demo.mp4](https://github.com/Clintobi/lazy-hands/blob/main/docs/demo/lazy-hands-demo.mp4) · [webm](https://github.com/Clintobi/lazy-hands/blob/main/docs/demo/lazy-hands-demo.webm)
- Generic page plus a waiting command: [docs/demo/lazy-hands-any-page.mp4](https://github.com/Clintobi/lazy-hands/blob/main/docs/demo/lazy-hands-any-page.mp4)

**Stills**

- [Idle hint](https://github.com/Clintobi/lazy-hands/blob/main/docs/screenshots/idle-1280.png)
- [Palm gesture](https://github.com/Clintobi/lazy-hands/blob/main/docs/screenshots/gesture-1280.png)
- [Approval mid-hold](https://github.com/Clintobi/lazy-hands/blob/main/docs/screenshots/approval-hold-1280.png)
- [Miss card](https://github.com/Clintobi/lazy-hands/blob/main/docs/screenshots/miss-card-1280.png)
- [Generic journal page](https://github.com/Clintobi/lazy-hands/blob/main/docs/screenshots/generic-page-1280.png)
- [Gesture on that page](https://github.com/Clintobi/lazy-hands/blob/main/docs/screenshots/generic-gesture-1280.png)
- [Command waiting](https://github.com/Clintobi/lazy-hands/blob/main/docs/screenshots/bridge-waiting-1280.png)
- [Command approved](https://github.com/Clintobi/lazy-hands/blob/main/docs/screenshots/bridge-approved-1280.png)

Local preview after `npm run dev`: http://127.0.0.1:4521 and http://127.0.0.1:4521/watch

# Code

https://github.com/Clintobi/lazy-hands

Five minutes, from the README:

```bash
npm install
npm run ext:build
# Chrome → chrome://extensions → Developer mode → Load unpacked → extension/
# Popup → Wake the camera

node bin/lazyhands.mjs approve -- echo ship-it
node bin/lazyhands.mjs approve -- git push --force origin main
```

The first ask is LOW and 0.8s. The second is CRITICAL and 2.4s. Both print a one-line local risk rating before anyone moves a thumb. Palm or timeout still refuses.

# How I Built It

MediaPipe Hands and BlazeFace start in the tab on the web demo. In the extension they run in an offscreen document so `getUserMedia` is not fighting the page. Poses travel as messages. The camera picture never leaves the machine.

The session has two modes on purpose. `watching` treats a short open palm as play or pause. `approval_pending` steals that palm and turns it into refuse. I learned the hard way that one vocabulary is not enough if the same hand both pauses a film and kills a command. The hold ring is the whole safety story. 800 ms is the floor. A critical command raises it to 2400 ms. The ring is a progress fraction of that longer number, so a 0.8s thumb on `rm -rf` still looks half empty.

Finding the main video is a scorer, not a site whitelist. YouTube-shaped pages have `html5-main-video`. Netflix-shaped pages have a player view class. Tiny autoplay tiles lose. Hidden nodes lose. Cross-origin iframes are honest about what they cannot reach. That work lives in `src/lib/find-video.ts` and the content script.

The localhost bridge is a WebSocket on `127.0.0.1:4537`. CLI, extension, and `/watch` all speak the same tiny protocol: hello, ask, answer, status. One ask at a time. If you time out, the command is not run. If a second ask arrives while one is pending, the new one is rejected. Refuse by default is a real default.

Week 3 is crowded with download tidiers and overnight chat summaries. I kept the gesture build because I could not find another Week 3 post that mixed a webcam veto with a local model. I did find plenty of prior art outside the tag, and I used it.

[Tapproval](https://tapproval.thoughtfulsteward.org/) marks a force-push CRITICAL on an Apple Watch, then one tap answers. I stole the mark and spent it on time. The card still says CRITICAL. The thumb has to stay up longer. [NyandSign](https://github.com/8796n/nyandsign) taught me the wake-sign idea (camera ignores you until you arm it). I did not ship that tonight. The risk line plus the longer hold was the sharper story against GestureApprove. Banking push-approve and Steam Big Picture already taught people that a destructive action should feel heavier than `echo`. Goblin Tools Magic ToDo gave me the "one line, then decide" shape. Lazy.so gave me the "capture the thing in front of you without leaving" shape. I pointed both at a pending shell command.

Gemma 2 2B IT q4 through WebLLM is the engine I want for both the film recap and the command one-liner. It needs WebGPU. This VM has no `navigator.gpu`, even with SwiftShader flags. DistilBART-CNN-6-6 through transformers.js is what actually wrote the Big Buck Bunny recap: 4867 ms to load, 572 ms to infer, on CPU. The command path uses those same loaders. If both miss, the recap falls back to an extractive caption slice and the risk line stays on the heuristic. The card says which engine spoke.

The fixture tests measured what I could measure without a living-room camera. Pose fixtures hit 60/60 for palm, thumb, and none. Swipes hit 32/32. Forty noisy hold sequences produced zero false approvals. DistilBART produced a real recap I kept in `docs/MODEL_RUN.md`. New tests check that `echo` still clears at 800 ms and that `git push --force` does not.

What failed: Gemma did not start here. Live YouTube captions on a signed-in watch page were not smoked on a Mac. Netflix DRM was not smoked. The Mac with the webcam is offline, so these demo files are Playwright recordings, not a handheld take from my sofa. Those limits are written down in `docs/LIMITS.md`.

# Why Open Innovation Matters

A webcam pointed at a sofa is a face. Captions from a film I have not finished are plot. A pending shell line is sometimes a secret path. I do not want those three things in one cloud request so a recap can sound smarter.

Offline also means I can refuse a command when the cafe wifi dies. There is no inference bill for holding a thumb. DistilBART and the extractive path both keep the product honest on a machine that cannot load Gemma.

I can swap the open model without rewriting the player. `src/lib/summarize.ts` already has three engines behind one function. The risk module keeps the tier on the heuristic so a warmer sentence cannot shorten the hold.

A closed API would have been the worse fit because the whole point of the veto is that the picture of my hand, the film I am mid-way through, and the command that might delete `/tmp` stay on the laptop I already paid for.

# Prize Categories

- Best Use of Gemma

Gemma 2 2B IT is the preferred on-device engine for the miss recap and for the one-line command blurb, loaded through WebLLM when WebGPU exists. DistilBART is the measured fallback on this VM. I am not listing other partner categories I did not actually use.

# Credits

MediaPipe Hands and BlazeFace (Apache 2.0) read the landmarks. The bundled clips are official Big Buck Bunny and Sintel trailers from the Blender Foundation, CC BY 3.0, re-encoded to 480p. Gemma terms apply if you download those weights. DistilBART-CNN-6-6 is Apache 2.0.

Prior art I am crediting on purpose: GestureApprove, NyandSign, Gestro, Nod Code, Tapproval, Moshi, Perch, GrantTap, and Couchmode. Steal notes with links: [docs/STEAL_LOG.md](https://github.com/Clintobi/lazy-hands/blob/main/docs/STEAL_LOG.md). Honest edges: [docs/LIMITS.md](https://github.com/Clintobi/lazy-hands/blob/main/docs/LIMITS.md). Fixture numbers: [docs/MEASUREMENTS.md](https://github.com/Clintobi/lazy-hands/blob/main/docs/MEASUREMENTS.md). The DistilBART recap that actually ran: [docs/MODEL_RUN.md](https://github.com/Clintobi/lazy-hands/blob/main/docs/MODEL_RUN.md).

#devchallenge #hf26challenge
