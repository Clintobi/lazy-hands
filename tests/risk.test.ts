import { describe, expect, it } from "vitest";
import { approvalKicker, holdHint } from "@/lib/overlay-copy";
import { phraseAgentCommand, phrasePageConfirm, phraseProposal } from "@/lib/proposals";
import { HOLD_BY_TIER, classifyCommandTier, formatRiskLine, rateCommand } from "@/lib/risk";
import { rateCommandWithModel } from "@/lib/risk-model";
import { HOLD_MS, holdProgress, initialSession, reduceSession, requiredHoldMs } from "@/lib/session";
import { VideoController } from "@/lib/video-controller";

describe("command risk tiers", () => {
  it("rates common commands the way a sofa veto should", () => {
    expect(classifyCommandTier("echo ship-it")).toBe("low");
    expect(classifyCommandTier("git status")).toBe("low");
    expect(classifyCommandTier("npm test")).toBe("low");
    expect(classifyCommandTier("npm install left-pad")).toBe("medium");
    expect(classifyCommandTier("git push origin main")).toBe("high");
    expect(classifyCommandTier("sudo npm install -g leftover")).toBe("high");
    expect(classifyCommandTier("git push --force origin main")).toBe("critical");
    expect(classifyCommandTier("git push -f origin main")).toBe("critical");
    expect(classifyCommandTier("rm -rf /tmp/demo")).toBe("critical");
    expect(classifyCommandTier("kubectl delete deploy web")).toBe("critical");
    expect(classifyCommandTier("")).toBe("medium");
  });

  it("never treats unknown commands as low risk", () => {
    expect(classifyCommandTier("mystery-bin --please")).toBe("medium");
    expect(rateCommand("mystery-bin --please").holdMs).toBe(HOLD_BY_TIER.medium);
  });

  it("writes a one-line blurb without asking the model first", () => {
    const force = rateCommand("git push --force origin main");
    expect(force.engine).toBe("heuristic");
    expect(force.blurb.toLowerCase()).toMatch(/overwrite|history/);
    expect(formatRiskLine(force)).toMatch(/CRITICAL · 2\.4s hold/);

    const echo = rateCommand("echo ship-it");
    expect(echo.blurb.toLowerCase()).toMatch(/read or print/);
    expect(echo.holdMs).toBe(HOLD_MS);
  });

  it("keeps the heuristic tier when the model path is forced off", async () => {
    const rated = await rateCommandWithModel("rm -rf /tmp/demo", { allowRemoteWeights: false });
    expect(rated.tier).toBe("critical");
    expect(rated.engine).toBe("heuristic");
    expect(rated.holdMs).toBe(HOLD_BY_TIER.critical);
    expect(rated.blurb.toLowerCase()).toMatch(/recursively delete/);
  });
});

describe("risk-tier hold", () => {
  it("refuses a short thumb on a critical command", () => {
    const proposal = phraseAgentCommand("rm -rf /tmp/demo", "/tmp");
    expect(requiredHoldMs(proposal)).toBe(HOLD_BY_TIER.critical);
    let s = reduceSession(initialSession(0), { type: "propose", proposal, force: true }, 1).state;
    const short = reduceSession(s, { type: "pose", pose: "thumbs_up", dt: HOLD_MS }, 10);
    expect(short.state.mode).toBe("approval_pending");
    expect(short.effects.some((e) => e.type === "apply_proposal")).toBe(false);
    expect(holdProgress(short.state)).toBeCloseTo(HOLD_MS / HOLD_BY_TIER.critical, 2);

    const done = reduceSession(short.state, { type: "pose", pose: "thumbs_up", dt: HOLD_BY_TIER.critical }, 20);
    expect(done.effects.some((e) => e.type === "apply_proposal")).toBe(true);
    expect(done.state.log[0]?.decision).toBe("approved");
  });

  it("still approves a low-risk echo after the usual 800 ms hold", () => {
    const proposal = phraseAgentCommand("echo ship-it", "/tmp");
    expect(proposal.title).toMatch(/Run this command/);
    expect(requiredHoldMs(proposal)).toBe(HOLD_MS);
    let s = reduceSession(initialSession(0), { type: "propose", proposal, force: true }, 1).state;
    const done = reduceSession(s, { type: "pose", pose: "thumbs_up", dt: HOLD_MS }, 10);
    expect(done.effects.some((e) => e.type === "apply_proposal")).toBe(true);
  });

  it("lengthens the hold on a destructive page confirm", () => {
    const proposal = phrasePageConfirm("Delete project", "[data-lh-btn='0']", true);
    expect(proposal.riskTier).toBe("high");
    expect(requiredHoldMs(proposal)).toBe(HOLD_BY_TIER.high);
    expect(holdHint(proposal)).toMatch(/1\.8s/);
  });

  it("leaves player asks on the short hold", () => {
    const proposal = phraseProposal("bookmark", { videoTime: 12 });
    expect(requiredHoldMs(proposal)).toBe(HOLD_MS);
    expect(approvalKicker(proposal)).toMatch(/model asks/i);
  });
});

describe("applyRiskBlurb", () => {
  it("keeps refuse-by-default copy when models are disabled", async () => {
    const ctl = new VideoController();
    const proposal = phraseAgentCommand("git push --force origin main", "/workspace");
    ctl.dispatch({ type: "propose", proposal, force: true }, 5);
    const rating = await rateCommandWithModel(proposal.payload.command as string, { allowRemoteWeights: false });
    const next = ctl.applyRiskBlurb(proposal, rating);
    expect(next.riskEngine).toBe("heuristic");
    expect(next.riskTier).toBe("critical");
    expect(ctl.publicState().proposal?.riskBlurb?.toLowerCase()).toMatch(/overwrite|history/);
    expect(approvalKicker(next)).toMatch(/Critical · 2\.4s hold/);
  });
});
