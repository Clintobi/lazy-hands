import { afterEach, describe, expect, it } from "vitest";
import { ApprovalBridge } from "@/bridge/server";
import { phraseAgentCommand } from "@/lib/proposals";
import { HOLD_MS } from "@/lib/session";
import { VideoController } from "@/lib/video-controller";

const bridges: ApprovalBridge[] = [];

afterEach(async () => {
  await Promise.all(bridges.splice(0).map((b) => b.close()));
});

describe("approval bridge", () => {
  it("runs the waiter only after a held thumbs-up", async () => {
    const bridge = new ApprovalBridge(0);
    bridges.push(bridge);
    await bridge.listen();
    const ctl = new VideoController({
      onDecision: (proposal, decision) => {
        if (proposal.kind === "agent_command") {
          bridge.answer({ type: "answer", id: String(proposal.payload.askId ?? "x"), decision });
        }
      },
    });

    const pending = bridge.ask("echo ship-it", "/tmp", 4000);
    const ask = bridge.pending;
    expect(ask?.command).toBe("echo ship-it");
    ctl.dispatch(
      {
        type: "propose",
        force: true,
        proposal: { ...phraseAgentCommand(ask!.command, ask!.cwd), payload: { ...ask, askId: ask!.id } },
      },
      10,
    );
    ctl.dispatch({ type: "pose", pose: "thumbs_up", dt: 200 }, 20);
    expect(bridge.pending).not.toBeNull();
    ctl.dispatch({ type: "pose", pose: "thumbs_up", dt: HOLD_MS }, 30);
    const answer = await pending;
    expect(answer.decision).toBe("approved");
    expect(bridge.pending).toBeNull();
  });

  it("refuses on palm and times out without a pose", async () => {
    const bridge = new ApprovalBridge(0);
    bridges.push(bridge);
    await bridge.listen();

    const ctl = new VideoController({
      onDecision: (proposal, decision) => {
        bridge.answer({ type: "answer", id: String(proposal.payload.askId ?? "x"), decision });
      },
    });
    const pending = bridge.ask("rm -rf /tmp/demo", "/tmp", 4000);
    const ask = bridge.pending!;
    ctl.dispatch(
      {
        type: "propose",
        force: true,
        proposal: { ...phraseAgentCommand(ask.command, ask.cwd), payload: { ...ask, askId: ask.id } },
      },
      5,
    );
    ctl.dispatch({ type: "pose", pose: "open_palm", dt: HOLD_MS }, 15);
    expect((await pending).decision).toBe("rejected");

    const timed = bridge.ask("echo later", "/tmp", 40);
    const late = await timed;
    expect(late.decision).toBe("timeout");
  });

  it("does not treat a short thumb as consent", async () => {
    const bridge = new ApprovalBridge(0);
    bridges.push(bridge);
    await bridge.listen();
    const ctl = new VideoController({
      onDecision: (proposal, decision) => {
        bridge.answer({ type: "answer", id: String(proposal.payload.askId ?? "x"), decision });
      },
    });
    const pending = bridge.ask("echo twitch", "/tmp", 80);
    const ask = bridge.pending!;
    ctl.dispatch(
      {
        type: "propose",
        force: true,
        proposal: { ...phraseAgentCommand(ask.command, ask.cwd), payload: { ...ask, askId: ask.id } },
      },
      5,
    );
    ctl.dispatch({ type: "pose", pose: "thumbs_up", dt: 120 }, 10);
    ctl.dispatch({ type: "pose", pose: "none", dt: 16 }, 11);
    const answer = await pending;
    expect(answer.decision).toBe("timeout");
  });
});
