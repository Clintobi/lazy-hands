import { applyProposal, emptySandbox, recordLog, type Sandbox } from "./sandbox";
import { harvestCaptions, type CaptionSource } from "./page-captions";
import { pickMainVideo, type VideoShape } from "./find-video";
import { pickProposal, type ActionKind, type Proposal } from "./proposals";
import { formatAgentDetail, type RiskRating } from "./risk";
import {
  holdProgress,
  initialSession,
  reduceSession,
  type SessionEffect,
  type SessionEvent,
  type SessionState,
} from "./session";
import { extractiveSummary } from "./summarize";
import { cuesInRange, type Cue } from "./vtt";

export type VideoHandle = VideoShape & {
  play?: () => Promise<void> | void;
  pause?: () => void;
};

export type ControllerHooks = {
  onState?: (state: PublicController) => void;
  onSummarise?: (from: number, to: number, text: string, origin: string) => void;
  onDecision?: (proposal: Proposal, decision: "approved" | "rejected") => void;
  clickConfirm?: (selector: string) => boolean;
  runCommand?: (command: string) => void;
};

export type PublicController = {
  mode: SessionState["mode"];
  playback: SessionState["playback"];
  attention: SessionState["attention"];
  holdProgress: number;
  holdIntent: "approve" | "reject" | null;
  proposal: Proposal | null;
  stamp: string | null;
  captionsOn: boolean;
  logCount: number;
  videoId?: string;
};

export class VideoController {
  session: SessionState = initialSession(0);
  sandbox: Sandbox = emptySandbox();
  video: VideoHandle | null = null;
  cues: Cue[] = [];
  captionOrigin = "none";
  already = new Set<ActionKind>();
  lastProposalAt = 0;
  introEnd: number | null = 8;
  hooks: ControllerHooks;

  constructor(hooks: ControllerHooks = {}) {
    this.hooks = hooks;
  }

  attach(video: VideoHandle | null) {
    this.video = video;
    this.emit();
  }

  loadCaptions(sources: CaptionSource[]) {
    const harvested = harvestCaptions(sources);
    this.cues = harvested.cues;
    this.captionOrigin = harvested.origin;
  }

  pickFrom(videos: VideoHandle[]) {
    const chosen = pickMainVideo(videos);
    this.attach(chosen);
    return chosen;
  }

  dispatch(event: SessionEvent, now = Date.now(), videoTime?: number) {
    const vt = videoTime ?? this.video?.currentTime ?? 0;
    const { state, effects } = reduceSession(this.session, event, now, vt);
    this.session = state;
    this.apply(effects);
    this.emit();
    return effects;
  }

  considerProposal(now = Date.now()) {
    if (!this.video) return null;
    if (now - this.lastProposalAt < 7000) return null;
    const proposal = pickProposal({
      videoTime: this.video.currentTime,
      duration: this.video.duration,
      captionsOn: this.sandbox.captionsOn,
      bookmarkCount: this.sandbox.bookmarks.length,
      noteCount: this.sandbox.notes.length,
      introEnd: this.introEnd,
      already: this.already,
      mode: this.session.mode,
      attention: this.session.attention,
    });
    if (!proposal) return null;
    this.already.add(proposal.kind);
    this.lastProposalAt = now;
    this.dispatch({ type: "propose", proposal }, now);
    return proposal;
  }

  publicState(): PublicController {
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
      videoId: this.video?.id,
    };
  }

  refresh() {
    this.emit();
  }

  applyRiskBlurb(proposal: Proposal, rating: RiskRating) {
    if (this.session.approval?.proposal.id !== proposal.id) return proposal;
    const command = String(proposal.payload.command ?? "");
    proposal.riskBlurb = rating.blurb;
    proposal.riskEngine = rating.engine;
    proposal.detail = formatAgentDetail(command, String(proposal.payload.cwd ?? ""), rating);
    this.emit();
    return proposal;
  }

  private apply(effects: SessionEffect[]) {
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

  private emit() {
    this.hooks.onState?.(this.publicState());
  }
}
