# Steal log (REA-style)

Scan date for the source notes: 24 to 25 October 2026. Method: public GitHub READMEs, product sites, Chrome Web Store copy, and the attached Week 3 scans. This is what we looked at, what we reused, and what we left on the table.

Lazy Hands is not Couchmode. GestureApprove is prior art for thumbs-up agent approval. We credit both.

## Shipped tonight

| Target | Observed feature | Evidence | How we reused it |
| --- | --- | --- | --- |
| Tapproval | Every agent prompt is marked with one of five risk tiers on the computer. A force-push to main arrives as CRITICAL. CRITICAL is never auto-approved. | https://tapproval.thoughtfulsteward.org/ · https://tapproval.thoughtfulsteward.org/apple-watch-claude-code.html | We kept refuse-by-default and the CRITICAL label, then spent the mark on **time**. `src/lib/risk.ts` rates the pending CLI command. The hold ring uses 800 / 1200 / 1800 / 2400 ms. The model may rewrite the sentence. It may not change the tier or skip the hold. |
| GestureApprove | Thumbs-up allows, open palm denies, timeout falls back to the terminal. Optional local Qwen3 "smart gate" can auto-allow obviously-safe commands. Deny-list still forces a gesture on dangerous ones. | https://github.com/tankxu/gesture-approve | Same two poses, same refuse-on-timeout. We inverted the smart gate. Gemma / DistilBART write a **one-line explanation**. They never auto-allow `ls` or anything else. Video plus agents share one hold ring in the browser. |
| Steam Big Picture / banking push-approve | Destructive actions use a hold or a heavier confirm, not the same tap as a low-stakes yes. | Common 10-foot and bank-app pattern. Steam Big Picture exit / purchase holds. Banking "slide to confirm" and push-approve on a high-value transfer. | Mechanic stolen into `requiredHoldMs`. `echo ship-it` is a short hold. `rm -rf` and `git push --force` fill a longer ring. A 0.8s thumb on a critical command stays pending. |
| Goblin Tools Magic ToDo | Type one overwhelming task, get a short broken-down result, then decide. "Spiciness" changes how much you get, not whether the task runs itself. | https://goblin.tools/todo | The pending command becomes one plain sentence before the thumb. Spiciness became risk: more hold, not more automation. |
| Lazy.so | One capture of the thing in front of you, without leaving the app you are in. | https://www.producthunt.com/products/lazy | The CLI captures the live argv and cwd and parks them on the page you are already watching. You do not switch to a settings wall. |
| NyandSign | Wake-sign: camera ignores you until you show the arming pose (default open palm). Target-tab, PiP, 12 signs. | https://github.com/8796n/nyandsign | **Not shipped tonight.** Logged as the next steal. We already have a popup "Wake the camera" button. A true pose-arm would stop sofa fidgets from pausing the film. |

## Looked at, left on the table

| Target | Observed feature | Evidence | Why not tonight |
| --- | --- | --- | --- |
| NyandSign | Target-tab control, PiP compact window, 12-sign vocabulary, hold-to-scroll | https://github.com/8796n/nyandsign | Video finder plus two poses already match the sofa brief. More signs raise false approvals. |
| Gestro | Finger-count next/skip on Shorts, Reels, TikTok | https://github.com/ramandeepsinghchhabra/Gestro | Site adapters are a week-two product. We score any HTML5 `<video>` instead. |
| Nod Code | AirPods nod / shake for Claude Code yes/no | https://github.com/hyusap/nodcode | No AirPods stack in this repo. Head gesture would fight the face-away recap. |
| Couchmode | 10-foot TV permission modal, Back = deny, first answer from TV or phone wins, LAN pair code | https://github.com/maximbilan/couchmode | Different job (Fire TV ACP). We credit it and stay in Chrome. |
| Moshi / Perch / GrantTap | Phone or watch tap to allow or deny. Timeout returns to the terminal. First answer wins if several surfaces are live. | https://getmoshi.app/guides/claude-code · https://perch.run/approve-from-iphone · https://granttap.com/agents/claude-code | We already refuse on timeout. Phone relay is a product, not a tonight steal. |
| claude-remote-approve | Keyboard stays live, "whoever answers first wins", opt-in Always | https://github.com/yuuichieguchi/claude-remote-approver | Y/N already work on the web player. Always would break refuse-by-default. |
| Gesture Remote Controller | Palm/fist/peace/thumb plus cooldown sliders, greasy-hands cooking pitch | https://chromewebstore.google.com/detail/gesture-remote-controller/idbpnhjdpmkjjoeoicpidkpniegkinnd | We already have a cooldown. Cooking-mode marketing is already their listing. |
| UntouchAi | Paid YouTube gesture pack | https://untouchai.web.app/ | Closed, YouTube-only. |
| one sec | Breathing pause before an impulse app opens | https://orbitalfocus.app/guides/adhd-focus-apps/ | The longer critical hold is our version of a pause that is a decision. |
| SlothMode (Week 3) | Webcam at 1 fps, phone-in-hand check, rest companion | https://dev.to/bin4yi/i-built-an-app-where-you-cant-fail-you-just-have-to-do-nothing-32g7 | Different theme use of MediaPipe. We kept the veto. |
| MeetNote | "What did I miss" for meetings | Chrome Web Store: MeetNote | Our miss card is for any captioned HTML5 video, triggered by face-away. |
| EyeRemote | Auto-pause when gaze leaves | https://github.com/karangupta8/EyeRemote | We recap on return instead of only pausing. |

## Unfiltered appendix (from the Week 3 scans)

Wide cast. Not ranked. Links only, so a later pass can steal more.

### Gesture / video / agent approve

- GestureApprove: https://github.com/tankxu/gesture-approve
- NyandSign: https://github.com/8796n/nyandsign
- Gestro (2026 Chrome): https://github.com/ramandeepsinghchhabra/Gestro
- Gestro (2022 Linux): https://github.com/RandomGuy-coder/Gestro
- Nod Code: https://github.com/hyusap/nodcode
- Gesture Remote Controller: https://chromewebstore.google.com/detail/gesture-remote-controller/idbpnhjdpmkjjoeoicpidkpniegkinnd
- UntouchAi: https://untouchai.web.app/
- Couchmode: https://github.com/maximbilan/couchmode
- TapQ: https://github.com/spaceamoeba-t/tapq
- VibePad: https://github.com/ignatovv/VibePad
- Gesture-Engine: https://github.com/RyanMAubrey/Gesture-Engine
- EyeRemote: https://github.com/karangupta8/EyeRemote
- Spatial Touch: https://apps.apple.com/us/app/spatial-touch/id6737378336
- Vibe Architect: https://devpost.com/software/vibearchitect-cli

### Agent approve from elsewhere

- Tapproval: https://tapproval.thoughtfulsteward.org/
- Tapproval helper: https://github.com/marcobelini/tapproval-helper
- Moshi: https://getmoshi.app/guides/claude-code
- Perch: https://perch.run/approve-from-iphone
- GrantTap: https://granttap.com/agents/claude-code
- claude-remote-approver: https://github.com/yuuichieguchi/claude-remote-approver
- cmux-iphone: https://github.com/lim-won/cmux-iphone
- Pocket Server: https://github.com/yayasoumah/pocket-server
- Happy: https://github.com/slopus/happy
- claude-pager: https://github.com/danielbowne/claude-pager
- ntfy-approve: https://github.com/achton/ntfy-approve
- clauding-afk: https://github.com/fomyio/clauding-afk
- claude-code-monitor: https://github.com/slackwero/claude-code-monitor
- Greenlight: https://github.com/GetGreenlight/greenlight-cli
- Pushary: https://www.producthunt.com/products/pushary
- CTRL Micro: https://www.producthunt.com/products/ctrl-micro
- Terminal Mode (Even Realities): https://www.producthunt.com/products/terminal-mode-by-even-realities
- Claude Code Remote Control: https://code.claude.com/docs/en/remote-control
- Extendo: https://news.ycombinator.com/item?id=47138996
- AI Remote: https://github.com/dynamite-bud/ai-remote

### Unrelated mechanics worth a later steal

- Goblin Tools Magic ToDo spiciness: https://goblin.tools/todo
- Lazy.so context capture: https://www.producthunt.com/products/lazy
- Siesta overnight fridge / receipt agent: https://dev.to/faijaleaqbal/siesta-the-local-agent-that-naps-so-you-dont-have-to-4gfd
- SlothForm 1-tap phone approval: https://dev.to/kakeroth/slothform-14-job-portals-0-retyped-answers-and-a-1-tap-phone-approval-44d2
- SlothMode webcam rest companion: https://dev.to/bin4yi/i-built-an-app-where-you-cant-fail-you-just-have-to-do-nothing-32g7
- one sec impulse pause: https://orbitalfocus.app/guides/adhd-focus-apps/
- Brick NFC app lock: https://getbrick.com/
- Due auto-snooze reminders: https://apps.apple.com/ca/app/due-reminders-timers/id390017969
- Finch pet-for-tiny-goals: https://blog.rulemoney.co.uk/best-apps-to-manage-adhd-an-honest-review/
- Lazy Tetris (no gravity until you are ready): https://news.ycombinator.com/item?id=44103839
- Mouthful voice food log: https://www.trymouthful.com/
- Dinnerfy swipe-to-dinner: https://www.producthunt.com/products/dinnerfy

## Decision

Ship the pair that makes the write-up different from "GestureApprove in a Chrome tab":

1. Local one-line risk / summary on a pending CLI approve (Gemma path, DistilBART fallback, heuristic floor).
2. Risk-tier longer hold for destructive commands, refuse by default.

Wake-sign stays in this file for a later night.
