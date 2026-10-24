"use strict";
(() => {
  // src/lib/vtt.ts
  function parseStamp(raw) {
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
  function parseVtt(source) {
    const blocks = source.replace(/^\uFEFF/, "").split(/\r?\n\r?\n/);
    const cues = [];
    for (const block of blocks) {
      const lines = block.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length === 0) continue;
      if (lines[0].startsWith("WEBVTT")) continue;
      const timeLine = lines.find((l) => l.includes("-->"));
      if (!timeLine) continue;
      const [startRaw, endRaw] = timeLine.split("-->");
      const start = parseStamp(startRaw);
      const end = parseStamp((endRaw ?? "").trim().split(/\s+/)[0] ?? "");
      const text = lines.filter((l) => l !== timeLine && !/^\d+$/.test(l.trim())).join(" ").replace(/<[^>]+>/g, "").trim();
      if (Number.isFinite(start) && Number.isFinite(end) && text) {
        cues.push({ start, end, text });
      }
    }
    return cues;
  }
  function cuesInRange(cues, start, end) {
    const a = Math.min(start, end);
    const b = Math.max(start, end);
    return cues.filter((c) => c.end > a && c.start < b);
  }

  // src/lib/page-captions.ts
  function harvestCaptions(sources) {
    for (const source of sources) {
      if (source.kind === "text_tracks" && source.cues.length > 0) {
        return { cues: source.cues, origin: "textTracks" };
      }
      if (source.kind === "vtt") {
        const cues = parseVtt(source.text);
        if (cues.length > 0) return { cues, origin: "vtt" };
      }
      if (source.kind === "youtube_dom" && source.lines.some((l) => l.trim())) {
        return { cues: linesToCues(source.lines), origin: "youtube-dom" };
      }
      if (source.kind === "transcript" && source.lines.some((l) => l.trim())) {
        return { cues: linesToCues(source.lines), origin: "transcript" };
      }
      if (source.kind === "aria" && source.lines.some((l) => l.trim())) {
        return { cues: linesToCues(source.lines), origin: "aria-live" };
      }
    }
    return { cues: [], origin: "none" };
  }
  function linesToCues(lines) {
    const clean = lines.map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
    return clean.map((text, i) => ({ start: i * 2, end: i * 2 + 2, text }));
  }
  function cuesFromTextTracks(tracks) {
    const out = [];
    for (let i = 0; i < tracks.length; i++) {
      const list = tracks[i]?.cues;
      if (!list) continue;
      for (let j = 0; j < list.length; j++) {
        const cue = list[j];
        if (!cue) continue;
        const text = String(cue.text ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        if (text) out.push({ start: cue.startTime, end: cue.endTime, text });
      }
    }
    return out;
  }
  function collectDomCaptionLines(nodes) {
    return Array.from(nodes).map((n) => (n.textContent ?? "").replace(/\s+/g, " ").trim()).filter((t) => t.length > 0);
  }

  // src/lib/page-confirm.ts
  var APPROVE_EXACT = /^(approve|confirm|allow|continue|accept|run|yes|ok|okay|execute|proceed|got it|do it)$/i;
  var APPROVE_PHRASE = /\b(approve|confirm|allow this|run (the )?command|continue|accept|yes,?\s+do it|execute)\b/i;
  var IGNORE = /\b(cancel|dismiss|close|not now|later|no thanks|edit|copy|share|subscribe|sign in|log in|search)\b/i;
  var DESTRUCTIVE = /\b(delete|remove|destroy|purchase|buy now|pay|send payment|transfer|drop database|format|shutdown|revoke|uninstall|overwrite|force push)\b/i;
  var CHAT_SEND = /^(send|submit)$/i;
  function isDestructiveLabel(label) {
    return DESTRUCTIVE.test(label.trim());
  }
  function classifyButton(button) {
    const label = button.label.replace(/\s+/g, " ").trim();
    if (!label || button.disabled) return null;
    if (IGNORE.test(label) && !APPROVE_EXACT.test(label)) return null;
    if (CHAT_SEND.test(label) && !button.inDialog) return null;
    const approve = APPROVE_EXACT.test(label) || Boolean(button.inDialog) && APPROVE_PHRASE.test(label);
    const destructive = isDestructiveLabel(label);
    if (!approve && !destructive) return null;
    if (!approve && destructive && !button.inDialog) return null;
    let score = approve ? 12 : 4;
    if (button.inDialog) score += 8;
    if (button.role === "button" || button.type === "button" || button.type === "submit") score += 2;
    if (destructive) score += 1;
    return {
      label,
      selector: button.selector ?? "",
      destructive,
      score
    };
  }
  function pickConfirmCandidate(buttons) {
    let best = null;
    for (const button of buttons) {
      const candidate = classifyButton(button);
      if (!candidate) continue;
      if (!best || candidate.score > best.score) best = candidate;
    }
    return best;
  }
  function buttonsFromDocument(nodes) {
    return Array.from(nodes).map((node, i) => ({
      label: (node.innerText ?? node.textContent ?? "").replace(/\s+/g, " ").trim(),
      role: node.getAttribute?.("role") ?? void 0,
      disabled: Boolean(node.disabled) || node.getAttribute?.("aria-disabled") === "true",
      type: node.type,
      selector: `[data-lh-btn="${i}"]`,
      inDialog: Boolean(node.closest?.("dialog, [role='dialog'], [role='alertdialog']"))
    }));
  }

  // src/lib/proposals.ts
  var seq = 0;
  function id(kind) {
    seq += 1;
    return `${kind}-${seq}`;
  }
  function phraseProposal(kind, ctx = {}) {
    const time = ctx.videoTime ?? 0;
    switch (kind) {
      case "skip_intro": {
        const until = ctx.introEnd ?? 8;
        return {
          id: id(kind),
          kind,
          source: "player",
          destructive: false,
          title: `Skip the intro (0:00 to ${clock(until)})?`,
          detail: "A local guess from the caption track. Nothing leaves this tab.",
          payload: { until }
        };
      }
      case "bookmark":
        return {
          id: id(kind),
          kind,
          source: "player",
          destructive: false,
          title: `Add a bookmark at ${clock(time)}?`,
          detail: "Saved in this session only. No account, no cloud.",
          payload: { at: time }
        };
      case "toggle_captions":
        return {
          id: id(kind),
          kind,
          source: "player",
          destructive: false,
          title: ctx.captionsOn ? "Turn captions off?" : "Turn captions on?",
          detail: "The next line stays on the picture, not on a server.",
          payload: { on: !ctx.captionsOn }
        };
      case "summarise_recent":
        return {
          id: id(kind),
          kind,
          source: "player",
          destructive: false,
          title: "Summarise the last stretch?",
          detail: "Two or three sentences from the captions you already have.",
          payload: { seconds: Math.min(300, Math.max(20, time)) }
        };
      case "note_todo":
        return {
          id: id(kind),
          kind,
          source: "player",
          destructive: false,
          title: "Pin a note for later?",
          detail: "A sandboxed scribble in this tab. It never emails, posts, or buys.",
          payload: {
            text: "Come back to this scene.",
            at: time
          }
        };
      case "agent_command":
        return phraseAgentCommand(String(ctx.videoTime ?? ""), "");
      case "page_confirm":
        return phrasePageConfirm("Confirm");
    }
  }
  function phraseAgentCommand(command, cwd) {
    return {
      id: id("agent_command"),
      kind: "agent_command",
      source: "bridge",
      destructive: looksDestructiveCommand(command),
      title: "Run this command?",
      detail: cwd ? `${command} \xB7 ${cwd}` : command,
      payload: { command, cwd }
    };
  }
  function phrasePageConfirm(label, selector = "", destructive = false) {
    return {
      id: id("page_confirm"),
      kind: "page_confirm",
      source: "page",
      destructive,
      title: destructive ? `Hold to confirm: ${label}` : `${label}?`,
      detail: destructive ? "This looks like it could change something. A flick will not click it." : "A held thumb clicks the button. A held palm leaves it alone.",
      payload: { label, selector, destructive }
    };
  }
  function looksDestructiveCommand(command) {
    return /\b(rm|sudo|dd|mkfs|shutdown|reboot|drop|delete|reset --hard|push --force|npm publish|kubectl delete)\b/i.test(
      command
    );
  }
  function pickProposal(ctx) {
    if (ctx.mode !== "watching" || ctx.attention !== "present") return null;
    if (ctx.introEnd && ctx.videoTime >= 1.5 && ctx.videoTime < ctx.introEnd && !ctx.already.has("skip_intro")) {
      return phraseProposal("skip_intro", ctx);
    }
    if (!ctx.captionsOn && ctx.videoTime >= 5 && !ctx.already.has("toggle_captions")) {
      return phraseProposal("toggle_captions", ctx);
    }
    if (ctx.videoTime >= 8 && ctx.bookmarkCount === 0 && !ctx.already.has("bookmark")) {
      return phraseProposal("bookmark", ctx);
    }
    if (ctx.videoTime >= 14 && !ctx.already.has("summarise_recent")) {
      return phraseProposal("summarise_recent", ctx);
    }
    if (ctx.videoTime >= 18 && ctx.noteCount === 0 && !ctx.already.has("note_todo")) {
      return phraseProposal("note_todo", ctx);
    }
    return null;
  }
  function clock(seconds) {
    const whole = Math.max(0, Math.floor(seconds));
    const m = Math.floor(whole / 60);
    const s = whole % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  // src/lib/find-video.ts
  function scoreVideo(video) {
    if (video.hidden) return -1;
    if (video.display === "none") return -1;
    if (video.visibility === "hidden") return -1;
    if ((video.opacity ?? 1) < 0.08) return -1;
    if (video.ariaHidden) return -1;
    if (video.ended && video.paused) return -1;
    const width = video.clientWidth || video.videoWidth || 0;
    const height = video.clientHeight || video.videoHeight || 0;
    if (width < 140 || height < 90) return -1;
    let score = width * height;
    if (!video.paused) score *= 1.45;
    if (video.duration >= 20) score *= 1.2;
    if (video.readyState >= 2) score *= 1.1;
    if (video.hasControls) score *= 1.05;
    if (video.inIframe) score *= 0.82;
    const cls = `${video.id ?? ""} ${video.className ?? ""}`.toLowerCase();
    if (/html5-main-video|video-stream|movie_player|watch-video|vp-video|r-1/.test(cls)) score *= 1.55;
    if (/preview|thumbnail|ad-|adsbox|miniplayer|pip/.test(cls) && width < 480) score *= 0.25;
    const host2 = (video.hostHint ?? "").toLowerCase();
    if (host2.includes("youtube") && /html5-main-video|video-stream/.test(cls)) score *= 1.2;
    if (host2.includes("netflix") && width >= 640) score *= 1.15;
    if (host2.includes("vimeo") && width >= 480) score *= 1.1;
    if ((host2.includes("x.com") || host2.includes("twitter")) && width >= 300) score *= 1.05;
    return score;
  }
  function pickMainVideo(videos2) {
    let best = null;
    let bestScore = 0;
    for (const video of videos2) {
      const score = scoreVideo(video);
      if (score > bestScore) {
        best = video;
        bestScore = score;
      }
    }
    return best;
  }
  function shapeFromElement(el, extras = {}) {
    return {
      id: el.id,
      className: typeof el.className === "string" ? el.className : el.className?.toString(),
      src: el.src,
      currentSrc: el.currentSrc,
      clientWidth: el.clientWidth,
      clientHeight: el.clientHeight,
      videoWidth: el.videoWidth,
      videoHeight: el.videoHeight,
      duration: Number.isFinite(el.duration) ? el.duration : 0,
      currentTime: el.currentTime,
      paused: el.paused,
      ended: el.ended,
      muted: el.muted,
      readyState: el.readyState,
      hidden: el.hidden,
      hasControls: el.controls,
      ariaHidden: el.getAttribute?.("aria-hidden") === "true",
      ...extras
    };
  }

  // src/lib/sandbox.ts
  function emptySandbox() {
    return {
      captionsOn: false,
      bookmarks: [],
      notes: [],
      seekTo: null,
      summariseLast: null,
      log: []
    };
  }
  function applyProposal(box, proposal) {
    const next = {
      ...box,
      bookmarks: box.bookmarks.slice(),
      notes: box.notes.slice(),
      log: box.log.slice(),
      seekTo: null,
      summariseLast: null
    };
    switch (proposal.kind) {
      case "skip_intro":
        next.seekTo = Number(proposal.payload.until ?? 0);
        break;
      case "bookmark":
        next.bookmarks.push({
          at: Number(proposal.payload.at ?? 0),
          label: String(proposal.payload.label ?? "Mark")
        });
        break;
      case "toggle_captions":
        next.captionsOn = Boolean(proposal.payload.on);
        break;
      case "summarise_recent":
        next.summariseLast = Number(proposal.payload.seconds ?? 60);
        break;
      case "note_todo":
        next.notes.push({
          at: Number(proposal.payload.at ?? 0),
          text: String(proposal.payload.text ?? "Come back to this scene.")
        });
        break;
      case "agent_command":
      case "page_confirm":
        break;
    }
    return next;
  }
  function recordLog(box, entry) {
    return { ...box, log: [entry, ...box.log].slice(0, 12) };
  }

  // src/lib/session.ts
  var PALM_PULSE_MS = 180;
  var HOLD_MS = 800;
  var GESTURE_COOLDOWN_MS = 900;
  var AWAY_ARM_MS = 900;
  var MIN_MISS_S = 4;
  var SKIP_S = 10;
  function initialSession(now = 0) {
    return {
      mode: "watching",
      playback: "paused",
      attention: "present",
      approval: null,
      palmMs: 0,
      palmFired: false,
      awayHiddenMs: 0,
      awayFromVideoTime: null,
      sawFace: false,
      cooldownUntil: now,
      lastStamp: null,
      log: []
    };
  }
  function holdProgress(state) {
    if (state.mode !== "approval_pending" || !state.approval?.hold) return 0;
    return Math.min(1, state.approval.hold.ms / HOLD_MS);
  }
  function reduceSession(state, event, now, videoTime = 0) {
    const next = {
      ...state,
      approval: state.approval ? { ...state.approval, hold: state.approval.hold ? { ...state.approval.hold } : null } : null,
      lastStamp: state.lastStamp ? { ...state.lastStamp } : null,
      log: state.log.slice()
    };
    const effects = [];
    const stamp = (label) => {
      next.lastStamp = { label, at: now };
      effects.push({ type: "stamp", label });
    };
    const cooling = now < next.cooldownUntil;
    const armCooldown = () => {
      next.cooldownUntil = now + GESTURE_COOLDOWN_MS;
    };
    switch (event.type) {
      case "play":
        next.playback = "playing";
        effects.push({ type: "set_playback", playing: true });
        break;
      case "pause":
        next.playback = "paused";
        effects.push({ type: "set_playback", playing: false });
        break;
      case "clear_stamp":
        next.lastStamp = null;
        break;
      case "swipe": {
        const seconds = event.dir === "left" ? -SKIP_S : SKIP_S;
        effects.push({ type: "seek", seconds });
        stamp(event.dir === "left" ? "Back 10s" : "Ahead 10s");
        armCooldown();
        break;
      }
      case "propose": {
        if (next.mode === "approval_pending") break;
        if (next.attention === "away" && !event.force) break;
        next.mode = "approval_pending";
        next.approval = { proposal: event.proposal, hold: null };
        next.palmMs = 0;
        next.palmFired = false;
        break;
      }
      case "timeout_approval": {
        if (next.mode !== "approval_pending" || !next.approval) break;
        const proposal = next.approval.proposal;
        const entry = {
          at: now,
          proposalId: proposal.id,
          kind: proposal.kind,
          title: proposal.title,
          decision: "rejected",
          gesture: "reject",
          holdMs: 0
        };
        next.log.unshift(entry);
        effects.push({ type: "log", entry });
        effects.push({ type: "decide", proposal, decision: "rejected" });
        stamp("Timed out");
        next.mode = "watching";
        next.approval = null;
        break;
      }
      case "miss_key": {
        if (next.attention === "present") {
          next.attention = "away";
          next.awayFromVideoTime = event.videoTime;
          next.awayHiddenMs = AWAY_ARM_MS;
          stamp("Away");
        } else {
          const from = next.awayFromVideoTime ?? event.videoTime;
          const span = event.videoTime - from;
          next.attention = "present";
          next.awayFromVideoTime = null;
          next.awayHiddenMs = 0;
          if (span >= MIN_MISS_S) {
            effects.push({ type: "summarise", from, to: event.videoTime });
          }
          stamp("Back");
        }
        break;
      }
      case "face": {
        if (event.visible) {
          next.sawFace = true;
          if (next.attention === "away" && next.awayFromVideoTime != null) {
            const from = next.awayFromVideoTime;
            const span = event.videoTime - from;
            next.attention = "present";
            next.awayFromVideoTime = null;
            next.awayHiddenMs = 0;
            if (span >= MIN_MISS_S) {
              effects.push({ type: "summarise", from, to: event.videoTime });
            }
            stamp("Back");
          } else {
            next.awayHiddenMs = 0;
          }
        } else if (next.attention === "present" && next.mode === "watching" && next.sawFace) {
          next.awayHiddenMs += event.dt;
          if (next.awayHiddenMs >= AWAY_ARM_MS) {
            next.attention = "away";
            next.awayFromVideoTime = event.videoTime;
            stamp("Away");
          }
        }
        break;
      }
      case "pose": {
        if (next.mode === "watching") {
          next.approval = null;
          if (event.pose === "open_palm") {
            next.palmMs += event.dt;
            if (!next.palmFired && !cooling && next.palmMs >= PALM_PULSE_MS) {
              next.palmFired = true;
              next.playback = next.playback === "playing" ? "paused" : "playing";
              effects.push({ type: "toggle_playback" });
              stamp(next.playback === "paused" ? "Pause" : "Play");
              armCooldown();
            }
          } else {
            next.palmMs = 0;
            next.palmFired = false;
          }
          break;
        }
        next.palmMs = 0;
        next.palmFired = false;
        if (!next.approval) break;
        const intent = event.pose === "thumbs_up" ? "approve" : event.pose === "open_palm" ? "reject" : null;
        if (!intent) {
          next.approval.hold = null;
          break;
        }
        if (!next.approval.hold || next.approval.hold.intent !== intent) {
          next.approval.hold = { intent, ms: event.dt };
        } else {
          next.approval.hold.ms += event.dt;
        }
        if (next.approval.hold.ms >= HOLD_MS) {
          const proposal = next.approval.proposal;
          const holdMs = next.approval.hold.ms;
          const entry = {
            at: now,
            proposalId: proposal.id,
            kind: proposal.kind,
            title: proposal.title,
            decision: intent === "approve" ? "approved" : "rejected",
            gesture: intent,
            holdMs
          };
          next.log.unshift(entry);
          effects.push({ type: "log", entry });
          effects.push({
            type: "decide",
            proposal,
            decision: intent === "approve" ? "approved" : "rejected"
          });
          if (intent === "approve") {
            effects.push({ type: "apply_proposal", proposal });
            stamp("Approved");
          } else {
            stamp("Held off");
          }
          next.mode = "watching";
          next.approval = null;
          armCooldown();
        }
        break;
      }
      default:
        break;
    }
    void videoTime;
    return { state: next, effects };
  }

  // src/lib/summarize.ts
  function splitSentences(text) {
    return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
  }
  function extractiveSummary(transcript) {
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
      score: s.length + (i === 0 ? 12 : 0) + (i === sentences.length - 1 ? 8 : 0)
    }));
    scored.sort((a, b) => b.score - a.score);
    const picked = scored.slice(0, 3).sort((a, b) => a.i - b.i).map((x) => x.s);
    return picked.join(" ");
  }

  // src/lib/video-controller.ts
  var VideoController = class {
    constructor(hooks = {}) {
      this.session = initialSession(0);
      this.sandbox = emptySandbox();
      this.video = null;
      this.cues = [];
      this.captionOrigin = "none";
      this.already = /* @__PURE__ */ new Set();
      this.lastProposalAt = 0;
      this.introEnd = 8;
      this.hooks = hooks;
    }
    attach(video) {
      this.video = video;
      this.emit();
    }
    loadCaptions(sources) {
      const harvested = harvestCaptions(sources);
      this.cues = harvested.cues;
      this.captionOrigin = harvested.origin;
    }
    pickFrom(videos2) {
      const chosen = pickMainVideo(videos2);
      this.attach(chosen);
      return chosen;
    }
    dispatch(event, now = Date.now(), videoTime) {
      const vt = videoTime ?? this.video?.currentTime ?? 0;
      const { state, effects } = reduceSession(this.session, event, now, vt);
      this.session = state;
      this.apply(effects);
      this.emit();
      return effects;
    }
    considerProposal(now = Date.now()) {
      if (!this.video) return null;
      if (now - this.lastProposalAt < 7e3) return null;
      const proposal = pickProposal({
        videoTime: this.video.currentTime,
        duration: this.video.duration,
        captionsOn: this.sandbox.captionsOn,
        bookmarkCount: this.sandbox.bookmarks.length,
        noteCount: this.sandbox.notes.length,
        introEnd: this.introEnd,
        already: this.already,
        mode: this.session.mode,
        attention: this.session.attention
      });
      if (!proposal) return null;
      this.already.add(proposal.kind);
      this.lastProposalAt = now;
      this.dispatch({ type: "propose", proposal }, now);
      return proposal;
    }
    publicState() {
      return {
        mode: this.session.mode,
        playback: this.session.playback,
        attention: this.session.attention,
        holdProgress: holdProgress(this.session),
        holdIntent: this.session.approval?.hold?.intent ?? null,
        proposal: this.session.approval?.proposal ?? null,
        stamp: this.session.lastStamp?.label ?? null,
        captionsOn: this.sandbox.captionsOn,
        logCount: this.sandbox.log.length,
        videoId: this.video?.id
      };
    }
    apply(effects) {
      for (const effect of effects) {
        if (effect.type === "toggle_playback" && this.video) {
          if (this.video.paused) {
            this.video.paused = false;
            void this.video.play?.();
          } else {
            this.video.paused = true;
            this.video.pause?.();
          }
        }
        if (effect.type === "set_playback" && this.video) {
          this.video.paused = !effect.playing;
          if (effect.playing) void this.video.play?.();
          else this.video.pause?.();
        }
        if (effect.type === "seek" && this.video) {
          this.video.currentTime = Math.max(0, this.video.currentTime + effect.seconds);
        }
        if (effect.type === "summarise") {
          const slice = cuesInRange(this.cues, effect.from, effect.to);
          const text = extractiveSummary(slice.map((c) => c.text).join(" "));
          this.hooks.onSummarise?.(effect.from, effect.to, text, this.captionOrigin);
        }
        if (effect.type === "apply_proposal") {
          this.sandbox = applyProposal(this.sandbox, effect.proposal);
          if (this.sandbox.seekTo != null && this.video) {
            this.video.currentTime = this.sandbox.seekTo;
          }
          if (effect.proposal.kind === "page_confirm") {
            const selector = String(effect.proposal.payload.selector ?? "");
            this.hooks.clickConfirm?.(selector);
          }
          if (effect.proposal.kind === "agent_command") {
            this.hooks.runCommand?.(String(effect.proposal.payload.command ?? ""));
          }
        }
        if (effect.type === "decide") {
          this.hooks.onDecision?.(effect.proposal, effect.decision);
        }
        if (effect.type === "log") {
          this.sandbox = recordLog(this.sandbox, effect.entry);
        }
      }
    }
    emit() {
      this.hooks.onState?.(this.publicState());
    }
  };

  // src/lib/overlay-copy.ts
  function holdHint(proposal) {
    if (!proposal) return `Hold a thumb about ${HOLD_MS / 1e3}s to agree. Hold a palm to stop.`;
    if (proposal.destructive) {
      return `This one can change something. Hold a thumb about ${HOLD_MS / 1e3}s. A flick does nothing.`;
    }
    return `Hold a thumb up to agree. Hold an open palm to stop. About ${HOLD_MS / 1e3}s, so a twitch does not count.`;
  }
  function onceHint() {
    return "Palm to pause. Swipe to skip. Thumb held to approve. Palm held to refuse. Look away, or press M.";
  }

  // src/extension/overlay-dom.ts
  function mountOverlay(host2) {
    const root = host2.attachShadow({ mode: "open" });
    const wrap = document.createElement("div");
    wrap.setAttribute("data-lh-root", "1");
    root.appendChild(wrap);
    const style = document.createElement("style");
    style.textContent = overlayCss();
    root.appendChild(style);
    return {
      render(state) {
        wrap.innerHTML = `
        <div class="lh-layer">
          ${state.hint ? `<aside class="lh-hint"><p class="lh-kicker">Once</p><p>${escapeHtml(onceHint())}</p></aside>` : ""}
          ${state.stamp ? `<div class="lh-stamp">${escapeHtml(state.stamp)}</div>` : ""}
          ${state.proposal ? `<article class="lh-card">
                  <p class="lh-kicker">${state.proposal.destructive ? "Hold to confirm" : "The model asks"}</p>
                  <h2>${escapeHtml(state.proposal.title)}</h2>
                  <p>${escapeHtml(state.proposal.detail)}</p>
                  <p class="lh-fine">${escapeHtml(holdHint(state.proposal))}</p>
                  <div class="lh-ring" style="--p:${state.holdProgress}">${state.holdIntent === "approve" ? "Yes" : state.holdIntent === "reject" ? "No" : "Hold"}</div>
                </article>` : ""}
          ${state.miss ? `<article class="lh-miss"><p class="lh-kicker">You missed a stretch</p><p>${escapeHtml(state.miss)}</p></article>` : ""}
          <span class="lh-lamp">${escapeHtml(state.lamp ?? "Lamp")}</span>
        </div>
      `;
      },
      unmount() {
        host2.remove();
      }
    };
  }
  function escapeHtml(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function overlayCss() {
    return `
    :host { all: initial; }
    .lh-layer {
      position: fixed; inset: 0; pointer-events: none; z-index: 2147483646;
      font-family: "Iowan Old Style", Palatino, "Palatino Linotype", Georgia, serif;
      color: #3b2a1c;
    }
    .lh-hint, .lh-card, .lh-miss {
      pointer-events: auto;
      background: #fbf3e4;
      color: #3b2a1c;
      box-shadow: 6px 6px 0 rgba(106, 64, 36, 0.28);
    }
    .lh-hint {
      position: absolute; left: 16px; top: 16px; max-width: 22rem;
      border-left: 5px solid #b07d32; padding: 0.75rem 0.9rem;
    }
    .lh-card, .lh-miss {
      position: absolute; left: 20px; right: 20px; bottom: 20px;
      padding: 0.9rem 1rem 1rem;
    }
    .lh-card { border-top: 5px solid #b07d32; }
    .lh-miss { border-left: 5px solid #b64a28; }
    .lh-kicker { text-transform: uppercase; letter-spacing: 0.16em; font-size: 11px; margin: 0 0 0.35rem; color: #6a4024; }
    h2 { font-style: italic; font-size: 1.35rem; margin: 0 0 0.3rem; }
    p { margin: 0 0 0.35rem; line-height: 1.4; }
    .lh-fine { font-size: 12px; color: #6a4024; }
    .lh-stamp {
      position: absolute; left: 8%; top: 18%;
      border: 3px solid #b64a28; color: #b64a28;
      font-style: italic; font-size: 2rem; padding: 0.1em 0.4em;
      background: rgba(251,243,228,0.8); transform: rotate(-7deg);
    }
    .lh-ring {
      position: absolute; right: 16px; top: 16px;
      width: 64px; height: 64px; border-radius: 50%;
      display: grid; place-items: center;
      background: conic-gradient(#4d5a33 calc(var(--p) * 360deg), #e7d3b4 0);
      font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em;
    }
    .lh-lamp {
      position: absolute; right: 16px; top: 16px;
      background: #fbf3e4; padding: 0.25rem 0.5rem; font-size: 11px;
      text-transform: uppercase; letter-spacing: 0.14em;
    }
  `;
  }

  // src/extension/content.ts
  var host = document.createElement("div");
  host.id = "lazy-hands-root";
  host.style.all = "initial";
  document.documentElement.appendChild(host);
  var overlay = mountOverlay(host);
  var miss = null;
  var hint = localStorage.getItem("lazy-hands-hint") !== "hid";
  var lamp = "Lamp idle";
  var scanned = /* @__PURE__ */ new Set();
  var controller = new VideoController({
    onSummarise: (_from, _to, text) => {
      miss = text;
      paint();
    },
    onDecision: (proposal, decision) => {
      chrome.runtime.sendMessage({
        type: "answer",
        id: String(proposal.payload.askId ?? proposal.id),
        decision
      });
    },
    clickConfirm: (selector) => {
      if (!selector) return false;
      const el = document.querySelector(selector);
      if (!(el instanceof HTMLElement)) return false;
      el.click();
      return true;
    },
    onState: () => paint()
  });
  function videos() {
    const extras = {
      hostHint: location.hostname,
      inIframe: window !== window.top,
      display: "",
      visibility: "",
      opacity: 1
    };
    return Array.from(document.querySelectorAll("video")).map((el) => {
      const style = window.getComputedStyle(el);
      return {
        ...shapeFromElement(el, {
          ...extras,
          display: style.display,
          visibility: style.visibility,
          opacity: Number(style.opacity)
        }),
        play: () => el.play(),
        pause: () => el.pause(),
        get currentTime() {
          return el.currentTime;
        },
        set currentTime(value) {
          el.currentTime = value;
        },
        get paused() {
          return el.paused;
        },
        set paused(value) {
          if (value) el.pause();
          else void el.play();
        }
      };
    });
  }
  function refreshVideo() {
    const chosen = controller.pickFrom(videos());
    if (!chosen) return;
    const el = document.querySelector("video");
    if (el) {
      controller.loadCaptions([
        { kind: "text_tracks", cues: cuesFromTextTracks(el.textTracks) },
        { kind: "youtube_dom", lines: collectDomCaptionLines(document.querySelectorAll(".ytp-caption-segment, .caption-window")) },
        { kind: "transcript", lines: collectDomCaptionLines(document.querySelectorAll("[data-purpose='transcript-cue'], .transcript-text")) }
      ]);
    }
  }
  function paint() {
    overlay.render({
      ...controller.publicState(),
      miss,
      hint,
      lamp
    });
  }
  function scanDialogs() {
    if (controller.session.mode === "approval_pending") return;
    const nodes = document.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit']");
    nodes.forEach((node, i) => node.setAttribute("data-lh-btn", String(i)));
    const candidate = pickConfirmCandidate(buttonsFromDocument(nodes));
    if (!candidate) return;
    const key = `${candidate.label}:${candidate.selector}`;
    if (scanned.has(key)) return;
    scanned.add(key);
    controller.dispatch({
      type: "propose",
      force: true,
      proposal: phrasePageConfirm(candidate.label, candidate.selector, candidate.destructive)
    });
  }
  chrome.runtime.onMessage.addListener((raw) => {
    const msg = raw;
    if (msg.type === "pose") controller.dispatch({ type: "pose", pose: msg.pose, dt: msg.dt });
    if (msg.type === "swipe") controller.dispatch({ type: "swipe", dir: msg.dir });
    if (msg.type === "face") {
      controller.dispatch({
        type: "face",
        visible: msg.visible,
        dt: msg.dt,
        videoTime: controller.video?.currentTime ?? 0
      });
    }
    if (msg.type === "vision-status") {
      lamp = msg.seeingFace ? "Sees you" : msg.seeingHand ? "Sees a hand" : msg.status;
      paint();
    }
    if (msg.type === "ask") {
      controller.dispatch({
        type: "propose",
        force: true,
        proposal: {
          ...phraseAgentCommand(msg.ask.command, msg.ask.cwd),
          payload: { command: msg.ask.command, cwd: msg.ask.cwd, askId: msg.ask.id }
        }
      });
    }
    return false;
  });
  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.code === "Space" && controller.session.mode === "watching") {
      event.preventDefault();
      controller.dispatch({ type: "pose", pose: "open_palm", dt: 200 });
    }
    if (event.key === "m" || event.key === "M") {
      controller.dispatch({ type: "miss_key", videoTime: controller.video?.currentTime ?? 0 });
    }
    if (event.key === "ArrowLeft") controller.dispatch({ type: "swipe", dir: "left" });
    if (event.key === "ArrowRight") controller.dispatch({ type: "swipe", dir: "right" });
    if (event.key === "Escape") {
      hint = false;
      localStorage.setItem("lazy-hands-hint", "hid");
      paint();
    }
  });
  refreshVideo();
  setInterval(() => {
    refreshVideo();
    controller.considerProposal();
    scanDialogs();
  }, 1500);
  new MutationObserver(() => {
    if (document.querySelector("dialog, [role='dialog'], [role='alertdialog']")) scanDialogs();
  }).observe(document.documentElement, { childList: true, subtree: true });
  paint();
})();
