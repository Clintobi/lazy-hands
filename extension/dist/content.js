"use strict";
(() => {
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
  function pickMainVideo(videos) {
    let best = null;
    let bestScore = 0;
    for (const video of videos) {
      const score = scoreVideo(video);
      if (score > bestScore) {
        best = video;
        bestScore = score;
      }
    }
    return best;
  }
  function shapeFromElement(el, extras2 = {}) {
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
      ...extras2
    };
  }

  // src/lib/bind-video.ts
  function bindHtmlVideo(el, extras2 = {}) {
    return {
      ...shapeFromElement(el, extras2),
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
      },
      get duration() {
        return Number.isFinite(el.duration) ? el.duration : 0;
      },
      get ended() {
        return el.ended;
      },
      get readyState() {
        return el.readyState;
      },
      get clientWidth() {
        return el.clientWidth;
      },
      get clientHeight() {
        return el.clientHeight;
      }
    };
  }
  function pageVideoExtras() {
    return {
      hostHint: typeof location !== "undefined" ? location.hostname : "",
      inIframe: typeof window !== "undefined" && window !== window.top
    };
  }

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
  var RANK = ["text_tracks", "vtt", "youtube_dom", "transcript", "aria"];
  function harvestCaptions(sources) {
    const ranked = RANK.flatMap((kind) => sources.filter((s) => s.kind === kind));
    for (const source of ranked) {
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
        if (text) out.push({ start: Number(cue.startTime ?? 0), end: Number(cue.endTime ?? 0), text });
      }
    }
    return out;
  }
  function collectDomCaptionLines(nodes) {
    return Array.from(nodes).map((n) => (n.textContent ?? "").replace(/\s+/g, " ").trim()).filter((t) => t.length > 0);
  }

  // src/lib/page-confirm.ts
  var APPROVE_EXACT = /^(approve|confirm|allow|execute|proceed)$/i;
  var WEAK_APPROVE = /^(yes|ok|okay|got it|continue|do it|run|accept)$/i;
  var APPROVE_PHRASE = /\b(approve|confirm|allow this|run (the )?command|continue|accept|yes,?\s+do it|execute)\b/i;
  var IGNORE = /\b(cancel|dismiss|close|not now|later|no thanks|edit|copy|share|subscribe|sign in|log in|search|accept (all )?cookies|reject all)\b/i;
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
    if (WEAK_APPROVE.test(label) && !button.inDialog) return null;
    const approve = APPROVE_EXACT.test(label) || Boolean(button.inDialog) && (APPROVE_PHRASE.test(label) || WEAK_APPROVE.test(label));
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

  // src/lib/risk.ts
  var HOLD_BY_TIER = {
    low: 800,
    medium: 1200,
    high: 1800,
    critical: 2400
  };
  var CRITICAL = [
    /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f\b/i,
    /\brm\s+-[a-zA-Z]*f[a-zA-Z]*r\b/i,
    /\bdd\b[\s\S]*\bif=/i,
    /\bmkfs\b/i,
    /\bwipefs\b/i,
    /\b(shutdown|reboot|halt|poweroff)\b/i,
    /\bdrop\s+(database|schema|table|db)\b/i,
    /\bgit\s+push\b[\s\S]*(--force-with-lease|--force|-f\b)/i,
    /\bgit\s+reset\b[\s\S]*--hard\b/i,
    /\bkubectl\s+delete\b/i,
    /\b(npm|pnpm|yarn|poetry|twine|gem|cargo)\s+publish\b/i,
    /\bnpm\s+unpublish\b/i,
    /\bchmod\s+-R\s+777\s+\//i,
    /\bdiskutil\s+erase/i,
    /\bterraform\s+destroy\b/i,
    /\bfind\b[\s\S]*\s-delete\b/i,
    /\bdocker\s+system\s+prune\b/i
  ];
  var HIGH = [
    /\bsudo\b/i,
    /\brm\b/i,
    /\bgit\s+push\b/i,
    /\bgit\s+reset\b/i,
    /\bgit\s+checkout\s+\./i,
    /\b(delete|unlink|truncate)\b/i,
    /\bkill\s+-9\b/i,
    /\b(chmod|chown)\b/i,
    /\bnpm\s+uninstall\s+-g\b/i,
    /\bdocker\s+rm\b/i,
    /\bhelm\s+uninstall\b/i,
    /\bmv\b[\s\S]*\/dev\/null/i,
    /\b(curl|wget)\b[\s\S]*\|\s*(sudo\s+)?(ba)?sh\b/i,
    /\bcat\b[\s\S]*(\.env|id_rsa|id_ed25519|\.ssh\/)/i,
    /\bgit\s+show\b[\s\S]*\.env/i
  ];
  var LOW_WHOLE = /^(echo|ls|pwd|whoami|date|true|false|hostname|uname|which|type|git\s+(status|diff|log|branch)|npm\s+(test|run)|pnpm\s+(test|run)|yarn\s+(test|run)|node\s+-(-version|v)|python3?\s+-(-version|V))(\s|$)/i;
  function clipCommand(command, max = 72) {
    const clean = command.replace(/\s+/g, " ").trim();
    if (clean.length <= max) return clean;
    return `${clean.slice(0, max - 1)}\u2026`;
  }
  function classifyCommandTier(command) {
    const line = command.replace(/\s+/g, " ").trim();
    if (!line) return "medium";
    if (CRITICAL.some((re) => re.test(line))) return "critical";
    if (HIGH.some((re) => re.test(line))) return "high";
    if (LOW_WHOLE.test(line) && !/[|&;]/.test(line)) return "low";
    return "medium";
  }
  function heuristicBlurb(command, tier) {
    const line = command.replace(/\s+/g, " ").trim();
    if (!line) return "Empty command. Nothing runs until something concrete is waiting.";
    if (/\brm\s+-[a-zA-Z]*[rf][a-zA-Z]*[rf]\b/i.test(line)) {
      const target = line.replace(/^[\s\S]*?\brm\s+-[a-zA-Z]+\s+/i, "").trim() || "those paths";
      return `This would recursively delete ${clipCommand(target, 48)}.`;
    }
    if (/\bgit\s+push\b/i.test(line) && /--force-with-lease|--force|-f\b/.test(line)) {
      return "This would overwrite remote git history.";
    }
    if (/\bgit\s+reset\b[\s\S]*--hard\b/i.test(line)) {
      return "This would throw away uncommitted work.";
    }
    if (/\b(npm|pnpm|yarn|poetry|twine|gem|cargo)\s+publish\b/i.test(line)) {
      return "This would publish a package to a public registry.";
    }
    if (/\b(shutdown|reboot|halt|poweroff)\b/i.test(line)) {
      return "This would shut the machine down.";
    }
    if (/\bdrop\s+(database|schema|table|db)\b/i.test(line)) {
      return "This would drop a database object.";
    }
    if (/\bkubectl\s+delete\b/i.test(line)) {
      return "This would delete a Kubernetes object.";
    }
    if (/\bsudo\b/i.test(line)) {
      return "This would run with elevated privileges.";
    }
    if (tier === "low") return `Looks like a read or print: ${clipCommand(line)}.`;
    if (tier === "high") return `This can change files or remotes: ${clipCommand(line)}.`;
    return `A command is waiting: ${clipCommand(line)}.`;
  }
  function rateCommand(command) {
    const tier = classifyCommandTier(command);
    return {
      tier,
      holdMs: HOLD_BY_TIER[tier],
      blurb: heuristicBlurb(command, tier),
      engine: "heuristic",
      note: "Local heuristic. The model has not rewritten this line yet."
    };
  }
  function ratePageLabel(label, destructive) {
    if (destructive) {
      return {
        tier: "high",
        holdMs: HOLD_BY_TIER.high,
        blurb: `This looks like it could change something (${label}).`,
        engine: "heuristic",
        note: "Label heuristic. Destructive page confirms use the long hold."
      };
    }
    return {
      tier: "low",
      holdMs: HOLD_BY_TIER.low,
      blurb: `A held thumb clicks ${label}. A held palm leaves it alone.`,
      engine: "heuristic",
      note: "Label heuristic."
    };
  }
  function formatRiskKicker(tier, holdMs) {
    const label = (tier ?? "low").replace(/^./, (c) => c.toUpperCase());
    return `${label} \xB7 ${secondsLabel(holdMs)} hold`;
  }
  function secondsLabel(ms) {
    return `${(ms / 1e3).toFixed(1).replace(/\.0$/, "")}s`;
  }
  function formatAgentDetail(command, cwd, rating) {
    const where = cwd ? ` \xB7 ${cwd}` : "";
    return `${rating.blurb}${where}`;
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
    const risk = rateCommand(command);
    return {
      id: id("agent_command"),
      kind: "agent_command",
      source: "bridge",
      destructive: risk.tier === "high" || risk.tier === "critical",
      title: risk.tier === "critical" ? "Hold longer to run this?" : "Run this command?",
      detail: formatAgentDetail(command, cwd, risk),
      payload: { command, cwd, riskTier: risk.tier, holdMs: risk.holdMs },
      holdMs: risk.holdMs,
      riskTier: risk.tier,
      riskBlurb: risk.blurb,
      riskEngine: risk.engine
    };
  }
  function phrasePageConfirm(label, selector = "", destructive = false) {
    const risk = ratePageLabel(label, destructive);
    return {
      id: id("page_confirm"),
      kind: "page_confirm",
      source: "page",
      destructive,
      title: destructive ? `Hold to confirm: ${label}` : `${label}?`,
      detail: risk.blurb,
      payload: { label, selector, destructive, riskTier: risk.tier, holdMs: risk.holdMs },
      holdMs: risk.holdMs,
      riskTier: risk.tier,
      riskBlurb: risk.blurb,
      riskEngine: risk.engine
    };
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
  function requiredHoldMs(proposal) {
    if (!proposal) return HOLD_MS;
    if (typeof proposal.holdMs === "number" && Number.isFinite(proposal.holdMs) && proposal.holdMs >= HOLD_MS) {
      return proposal.holdMs;
    }
    if (proposal.destructive) return HOLD_BY_TIER.high;
    return HOLD_MS;
  }
  function holdProgress(state) {
    if (state.mode !== "approval_pending" || !state.approval?.hold) return 0;
    return Math.min(1, state.approval.hold.ms / requiredHoldMs(state.approval.proposal));
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
        if (next.approval.hold.ms >= requiredHoldMs(next.approval.proposal)) {
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
    pickFrom(videos) {
      const chosen = pickMainVideo(videos);
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
    refresh() {
      this.emit();
    }
    applyRiskBlurb(proposal, rating) {
      if (this.session.approval?.proposal.id !== proposal.id) return proposal;
      const command = String(proposal.payload.command ?? "");
      proposal.riskBlurb = rating.blurb;
      proposal.riskEngine = rating.engine;
      proposal.detail = formatAgentDetail(command, String(proposal.payload.cwd ?? ""), rating);
      this.emit();
      return proposal;
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
    const ms = requiredHoldMs(proposal);
    const seconds = (ms / 1e3).toFixed(1).replace(/\.0$/, "");
    if (!proposal) return `Hold a thumb about ${seconds}s to agree. Hold a palm to stop.`;
    if (proposal.riskTier === "critical" || proposal.destructive) {
      return `This one can change something. Hold a thumb about ${seconds}s. A flick does nothing.`;
    }
    return `Hold a thumb up to agree. Hold an open palm to stop. About ${seconds}s, so a twitch does not count.`;
  }
  function onceHint() {
    return "Palm to pause. Swipe to skip. Thumb held to approve. Palm held to refuse. Look away, or press M.";
  }
  function approvalKicker(proposal) {
    if (proposal.source === "bridge") {
      return formatRiskKicker(proposal.riskTier, requiredHoldMs(proposal));
    }
    if (proposal.destructive) return "Hold to confirm";
    return "The model asks";
  }

  // src/extension/overlay-dom.ts
  function mountOverlay(host2, hooks = {}) {
    const root = host2.attachShadow({ mode: "open" });
    const wrap = document.createElement("div");
    wrap.setAttribute("data-lh-root", "1");
    root.appendChild(wrap);
    const style = document.createElement("style");
    style.textContent = overlayCss();
    root.appendChild(style);
    wrap.addEventListener("click", (event) => {
      const target = event.target;
      if (target?.dataset.lh === "got-it") hooks.onDismissHint?.();
    });
    return {
      render(state) {
        wrap.innerHTML = `
        <div class="lh-layer">
          ${state.hint ? `<aside class="lh-hint"><p class="lh-kicker">Once</p><p>${escapeHtml(onceHint())}</p><button type="button" data-lh="got-it">Got it</button></aside>` : ""}
          ${state.stamp ? `<div class="lh-stamp">${escapeHtml(state.stamp)}</div>` : ""}
          ${state.proposal ? `<article class="lh-card" data-testid="approval-card" data-risk="${escapeHtml(state.proposal.riskTier ?? (state.proposal.destructive ? "high" : "low"))}">
                  <p class="lh-kicker">${escapeHtml(approvalKicker(state.proposal))}</p>
                  <h2>${escapeHtml(state.proposal.title)}</h2>
                  <p>${escapeHtml(state.proposal.riskBlurb ?? state.proposal.detail)}</p>
                  <p class="lh-fine">${escapeHtml(holdHint(state.proposal))}</p>
                  <div class="lh-ring" style="--p:${state.holdProgress}">${state.holdIntent === "approve" ? "Yes" : state.holdIntent === "reject" ? "No" : "Hold"}</div>
                </article>` : ""}
          ${state.miss ? `<article class="lh-miss"><p class="lh-kicker">You missed a stretch</p><p>${escapeHtml(state.miss)}</p></article>` : ""}
          ${state.lamp ? `<span class="lh-lamp">${escapeHtml(state.lamp)}</span>` : ""}
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
    button[data-lh="got-it"] {
      background: none; border: 0; color: #8a341c; padding: 0; font: inherit;
      text-decoration: underline; text-underline-offset: 3px; cursor: pointer;
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
  var isTop = window === window.top;
  var host = document.createElement("div");
  host.id = "lazy-hands-root";
  host.style.all = "initial";
  var overlay = null;
  var miss = null;
  var hint = localStorage.getItem("lazy-hands-hint") !== "hid";
  var lamp = "";
  var scanned = /* @__PURE__ */ new Set();
  var held = { yes: false, no: false };
  var controller = new VideoController({
    onSummarise: (_from, _to, text) => {
      miss = text;
      paint();
    },
    onDecision: (proposal, decision) => {
      if (!isTop) return;
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
  function extras() {
    const base = pageVideoExtras();
    return {
      ...base,
      display: "",
      visibility: "",
      opacity: 1
    };
  }
  function listVideos() {
    return Array.from(document.querySelectorAll("video")).map((el) => {
      const style = window.getComputedStyle(el);
      return {
        handle: bindHtmlVideo(el, {
          ...extras(),
          display: style.display,
          visibility: style.visibility,
          opacity: Number(style.opacity)
        }),
        el
      };
    });
  }
  function harvestFrom(el) {
    controller.loadCaptions([
      { kind: "text_tracks", cues: cuesFromTextTracks(el.textTracks) },
      {
        kind: "youtube_dom",
        lines: collectDomCaptionLines(document.querySelectorAll(".ytp-caption-segment, .caption-window"))
      },
      {
        kind: "transcript",
        lines: collectDomCaptionLines(
          document.querySelectorAll("[data-purpose='transcript-cue'], .transcript-text, ytd-transcript-segment-renderer")
        )
      }
    ]);
  }
  function refreshVideo() {
    const list = listVideos();
    const chosen = controller.pickFrom(list.map((row) => row.handle));
    const match = list.find((row) => row.handle === chosen);
    if (match) harvestFrom(match.el);
    maybeMount();
  }
  function maybeMount() {
    if (overlay) return;
    if (!isTop && !controller.video) return;
    if (!host.isConnected) document.documentElement.appendChild(host);
    overlay = mountOverlay(host, {
      onDismissHint: () => {
        hint = false;
        try {
          localStorage.setItem("lazy-hands-hint", "hid");
        } catch {
        }
        paint();
      }
    });
  }
  function paint() {
    if (!overlay) return;
    const pub = controller.publicState();
    const hasWork = Boolean(controller.video || pub.proposal || miss || pub.stamp);
    overlay.render({
      ...pub,
      miss,
      hint: hint && Boolean(controller.video),
      lamp: hasWork ? lamp : ""
    });
  }
  function uniqueButtons(nodes) {
    return Array.from(new Set(nodes));
  }
  function scanDialogs() {
    if (!isTop) return;
    if (controller.session.mode === "approval_pending") return;
    const nodes = [];
    document.querySelectorAll("dialog, [role='dialog'], [role='alertdialog']").forEach((dialog) => {
      if (dialog instanceof HTMLDialogElement && !dialog.open) return;
      dialog.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit']").forEach((node) => {
        nodes.push(node);
      });
    });
    document.querySelectorAll("button, [role='button']").forEach((node) => {
      const label = (node.textContent ?? "").replace(/\s+/g, " ").trim();
      if (/^(approve|confirm|allow|execute|proceed)$/i.test(label)) nodes.push(node);
    });
    const unique = uniqueButtons(nodes);
    unique.forEach((node, i) => node.setAttribute("data-lh-btn", String(i)));
    const candidate = pickConfirmCandidate(buttonsFromDocument(unique));
    if (!candidate) return;
    const key = `${location.href}:${candidate.label}:${candidate.selector}`;
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
      if (!isTop) return false;
      maybeMount();
      const proposal = {
        ...phraseAgentCommand(msg.ask.command, msg.ask.cwd),
        payload: { command: msg.ask.command, cwd: msg.ask.cwd, askId: msg.ask.id }
      };
      controller.dispatch({
        type: "propose",
        force: true,
        proposal
      });
    }
    return false;
  });
  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.code === "Space" && controller.session.mode === "watching" && controller.video) {
      event.preventDefault();
      controller.dispatch({ type: "pose", pose: "open_palm", dt: 200 });
    }
    if (event.key === "m" || event.key === "M") {
      controller.dispatch({ type: "miss_key", videoTime: controller.video?.currentTime ?? 0 });
    }
    if (event.key === "ArrowLeft") controller.dispatch({ type: "swipe", dir: "left" });
    if (event.key === "ArrowRight") controller.dispatch({ type: "swipe", dir: "right" });
    if (event.key === "y" || event.key === "Y") held.yes = true;
    if (event.key === "n" || event.key === "N") held.no = true;
    if (event.key === "Escape") {
      hint = false;
      try {
        localStorage.setItem("lazy-hands-hint", "hid");
      } catch {
      }
      paint();
    }
  });
  window.addEventListener("keyup", (event) => {
    if (event.key === "y" || event.key === "Y") held.yes = false;
    if (event.key === "n" || event.key === "N") held.no = false;
  });
  window.setInterval(() => {
    if (held.yes) controller.dispatch({ type: "pose", pose: "thumbs_up", dt: 50 });
    if (held.no) controller.dispatch({ type: "pose", pose: "open_palm", dt: 50 });
  }, 50);
  refreshVideo();
  setInterval(() => {
    refreshVideo();
    if (controller.video) controller.considerProposal();
    scanDialogs();
  }, 1500);
  new MutationObserver(() => {
    if (isTop && document.querySelector("dialog, [role='dialog'], [role='alertdialog']")) scanDialogs();
    if (!controller.video) refreshVideo();
  }).observe(document.documentElement, { childList: true, subtree: true });
  maybeMount();
  paint();
})();
