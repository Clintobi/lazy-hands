import type { Proposal } from "./proposals";
import type { ApprovalLogEntry } from "./session";

export type Bookmark = { at: number; label: string };
export type Note = { at: number; text: string };

export type Sandbox = {
  captionsOn: boolean;
  bookmarks: Bookmark[];
  notes: Note[];
  seekTo: number | null;
  summariseLast: number | null;
  log: ApprovalLogEntry[];
};

export function emptySandbox(): Sandbox {
  return {
    captionsOn: false,
    bookmarks: [],
    notes: [],
    seekTo: null,
    summariseLast: null,
    log: [],
  };
}

export function applyProposal(box: Sandbox, proposal: Proposal): Sandbox {
  const next: Sandbox = {
    ...box,
    bookmarks: box.bookmarks.slice(),
    notes: box.notes.slice(),
    log: box.log.slice(),
    seekTo: null,
    summariseLast: null,
  };

  switch (proposal.kind) {
    case "skip_intro":
      next.seekTo = Number(proposal.payload.until ?? 0);
      break;
    case "bookmark":
      next.bookmarks.push({
        at: Number(proposal.payload.at ?? 0),
        label: String(proposal.payload.label ?? "Mark"),
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
        text: String(proposal.payload.text ?? "Come back to this scene."),
      });
      break;
  }

  return next;
}

export function recordLog(box: Sandbox, entry: ApprovalLogEntry): Sandbox {
  return { ...box, log: [entry, ...box.log].slice(0, 12) };
}
