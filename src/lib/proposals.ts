export const ACTION_KINDS = [
  "skip_intro",
  "bookmark",
  "toggle_captions",
  "summarise_recent",
  "note_todo",
  "agent_command",
  "page_confirm",
] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];

export type ProposalSource = "player" | "bridge" | "page";

export type Proposal = {
  id: string;
  kind: ActionKind;
  title: string;
  detail: string;
  payload: Record<string, unknown>;
  source: ProposalSource;
  destructive: boolean;
};

export type ProposalContext = {
  videoTime: number;
  duration: number;
  captionsOn: boolean;
  bookmarkCount: number;
  noteCount: number;
  introEnd: number | null;
  already: Set<ActionKind>;
  mode: "watching" | "approval_pending";
  attention: "present" | "away";
};

let seq = 0;

function id(kind: ActionKind): string {
  seq += 1;
  return `${kind}-${seq}`;
}

export function resetProposalIds() {
  seq = 0;
}

export function phraseProposal(kind: ActionKind, ctx: Partial<ProposalContext> = {}): Proposal {
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
        payload: { until },
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
        payload: { at: time },
      };
    case "toggle_captions":
      return {
        id: id(kind),
        kind,
        source: "player",
        destructive: false,
        title: ctx.captionsOn ? "Turn captions off?" : "Turn captions on?",
        detail: "The next line stays on the picture, not on a server.",
        payload: { on: !ctx.captionsOn },
      };
    case "summarise_recent":
      return {
        id: id(kind),
        kind,
        source: "player",
        destructive: false,
        title: "Summarise the last stretch?",
        detail: "Two or three sentences from the captions you already have.",
        payload: { seconds: Math.min(300, Math.max(20, time)) },
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
          at: time,
        },
      };
    case "agent_command":
      return phraseAgentCommand(String(ctx.videoTime ?? ""), "");
    case "page_confirm":
      return phrasePageConfirm("Confirm");
  }
}

export function phraseAgentCommand(command: string, cwd: string): Proposal {
  return {
    id: id("agent_command"),
    kind: "agent_command",
    source: "bridge",
    destructive: looksDestructiveCommand(command),
    title: "Run this command?",
    detail: cwd ? `${command} · ${cwd}` : command,
    payload: { command, cwd },
  };
}

export function phrasePageConfirm(label: string, selector = "", destructive = false): Proposal {
  return {
    id: id("page_confirm"),
    kind: "page_confirm",
    source: "page",
    destructive,
    title: destructive ? `Hold to confirm: ${label}` : `${label}?`,
    detail: destructive
      ? "This looks like it could change something. A flick will not click it."
      : "A held thumb clicks the button. A held palm leaves it alone.",
    payload: { label, selector, destructive },
  };
}

export function looksDestructiveCommand(command: string): boolean {
  return /\b(rm|sudo|dd|mkfs|shutdown|reboot|drop|delete|reset --hard|push --force|npm publish|kubectl delete)\b/i.test(
    command,
  );
}

export function pickProposal(ctx: ProposalContext): Proposal | null {
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

function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
