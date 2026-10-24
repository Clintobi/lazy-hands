"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SiteOverlay } from "@/components/site-overlay";
import { parseBridgeMessage, wsUrl, type BridgeAsk } from "@/lib/bridge-protocol";
import { shapeFromElement } from "@/lib/find-video";
import { cuesFromTextTracks } from "@/lib/page-captions";
import { phraseAgentCommand } from "@/lib/proposals";
import { VideoController, type PublicController, type VideoHandle } from "@/lib/video-controller";

function bindVideo(el: HTMLVideoElement): VideoHandle {
  return {
    ...shapeFromElement(el, { hostHint: "northdock.local" }),
    play: () => el.play(),
    pause: () => el.pause(),
    get currentTime() {
      return el.currentTime;
    },
    set currentTime(value: number) {
      el.currentTime = value;
    },
    get paused() {
      return el.paused;
    },
    set paused(value: boolean) {
      if (value) el.pause();
      else void el.play();
    },
  };
}

export function WatchDesk() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ctlRef = useRef(new VideoController());
  const [state, setState] = useState<PublicController>(ctlRef.current.publicState());
  const [miss, setMiss] = useState<string | null>(null);
  const [hint, setHint] = useState(true);
  const [pending, setPending] = useState<BridgeAsk | null>(null);
  const [term, setTerm] = useState("$ lazyhands approve -- echo ship-it");

  useEffect(() => {
    const ctl = ctlRef.current;
    ctl.hooks = {
      onState: setState,
      onSummarise: (_f, _t, text) => setMiss(text),
    };
    const video = videoRef.current;
    if (video) {
      ctl.attach(bindVideo(video));
      ctl.loadCaptions([{ kind: "text_tracks", cues: cuesFromTextTracks(video.textTracks) }]);
    }
  }, []);

  const showFrame = useCallback(async (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    video.currentTime = seconds;
    await video.play().catch(() => undefined);
    await new Promise((r) => setTimeout(r, 280));
    video.pause();
    if (ctlRef.current.video) ctlRef.current.video.currentTime = video.currentTime;
  }, []);

  const ask = useCallback((command: string) => {
    const proposal = phraseAgentCommand(command, "/workspace");
    proposal.payload.askId = `local-${Date.now()}`;
    ctlRef.current.dispatch({ type: "propose", proposal, force: true });
    setPending({
      type: "ask",
      id: String(proposal.payload.askId),
      command,
      cwd: "/workspace",
      timeoutMs: 90000,
      createdAt: Date.now(),
    });
    setTerm(`$ lazyhands approve -- ${command}\nWaiting for a thumbs-up to run:\n  ${command}`);
  }, []);

  useEffect(() => {
    window.__lazyHands = {
      getState: () => ({
        ...ctlRef.current.publicState(),
        missed: miss ? { from: 0, to: 0, text: miss } : null,
      }),
      pose: (pose, dt) => ctlRef.current.dispatch({ type: "pose", pose, dt }),
      swipe: (dir) => ctlRef.current.dispatch({ type: "swipe", dir }),
      propose: () => undefined,
      face: () => undefined,
      missKey: () => ctlRef.current.dispatch({ type: "miss_key", videoTime: videoRef.current?.currentTime ?? 0 }),
      loadSample: () => undefined,
      setTime: (seconds) => {
        if (videoRef.current) videoRef.current.currentTime = seconds;
      },
      showFrame,
      setMiss: (payload) => setMiss(payload.text),
      dismissHint: () => setHint(false),
      lockAutoPropose: () => undefined,
      ask,
    };
    return () => {
      delete window.__lazyHands;
    };
  }, [ask, showFrame, miss]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.code === "Space") {
        event.preventDefault();
        ctlRef.current.dispatch({ type: "pose", pose: "open_palm", dt: 200 });
      }
      if (event.key === "m" || event.key === "M") {
        ctlRef.current.dispatch({ type: "miss_key", videoTime: videoRef.current?.currentTime ?? 0 });
      }
      if (event.key === "ArrowRight") ctlRef.current.dispatch({ type: "swipe", dir: "right" });
      if (event.key === "ArrowLeft") ctlRef.current.dispatch({ type: "swipe", dir: "left" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(wsUrl());
    } catch {
      return;
    }
    socket.addEventListener("open", () => socket?.send(JSON.stringify({ type: "hello", role: "web" })));
    socket.addEventListener("message", (event) => {
      const message = parseBridgeMessage(String(event.data));
      if (message?.type === "ask" || (message?.type === "status" && message.pending)) {
        const askMsg = message.type === "ask" ? message : message.pending;
        if (!askMsg) return;
        setPending(askMsg);
        setTerm(`$ lazyhands approve -- ${askMsg.command}\nWaiting for a thumbs-up to run:\n  ${askMsg.command}`);
        ctlRef.current.dispatch({
          type: "propose",
          force: true,
          proposal: {
            ...phraseAgentCommand(askMsg.command, askMsg.cwd),
            payload: { command: askMsg.command, cwd: askMsg.cwd, askId: askMsg.id },
          },
        });
      }
      if (message?.type === "answer") {
        setTerm((prev) => `${prev}\n${message.decision === "approved" ? "Approved. Running." : `Refused (${message.decision}).`}`);
        setPending(null);
      }
    });
    return () => socket?.close();
  }, []);

  useEffect(() => {
    ctlRef.current.hooks.onDecision = (proposal, decision) => {
      if (proposal.kind === "agent_command") {
        setTerm((prev) => `${prev}\n${decision === "approved" ? "Approved. Running." : "Refused. Command not run."}`);
        setPending(null);
      }
    };
  }, []);

  return (
    <div className="min-h-dvh bg-[#f3ead6] text-[#3b2a1c]">
      <header className="mx-auto flex max-w-[1100px] items-end justify-between px-5 py-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--walnut)]">North Dock Notes</p>
          <h1 className="font-display text-3xl italic">Evening reel, 24 Oct</h1>
        </div>
        <p className="max-w-xs text-right text-[12px] text-[var(--ink)]/70">
          A local journal page with a film in it. The gestures attach to this video the same way they attach to YouTube.
        </p>
      </header>
      <main className="mx-auto max-w-[1100px] px-5 pb-6">
        <section className="film-frame relative overflow-hidden">
          <div className="relative aspect-video bg-[#2a1c12]">
            <video
              ref={videoRef}
              className="relative z-0 h-full w-full object-cover"
              src="/samples/bunny/clip.mp4"
              poster="/samples/bunny/poster.jpg"
              muted
              playsInline
              preload="auto"
              crossOrigin="anonymous"
              onLoadedMetadata={(e) => {
                ctlRef.current.attach(bindVideo(e.currentTarget));
                void fetch("/samples/bunny/captions.vtt")
                  .then((r) => r.text())
                  .then((text) => ctlRef.current.loadCaptions([{ kind: "vtt", text }]))
                  .catch(() => undefined);
                void showFrame(10);
              }}
            >
              <track kind="subtitles" srcLang="en" src="/samples/bunny/captions.vtt" default />
            </video>
            <SiteOverlay state={state} miss={miss} hint={hint} onDismissHint={() => setHint(false)} />
          </div>
        </section>
        <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
          <article>
            <h2 className="font-display text-xl italic">Not a special player</h2>
            <p className="mt-2 max-w-xl text-[15px] leading-6 text-[var(--ink)]/80">
              This page is a stand-in for any site that already has an HTML5 video. Lazy Hands finds that video, then waits.
              Open the Chrome extension on YouTube, Vimeo, or a file:// tab the same way.
            </p>
          </article>
          <pre
            data-testid="bridge-term"
            className="min-h-[8rem] overflow-auto rounded-[2px] bg-[#3b2a1c] px-3 py-3 font-mono text-[12px] leading-5 text-[#f3ead6]"
          >
            {term}
            {pending ? "\n…" : ""}
          </pre>
        </div>
      </main>
    </div>
  );
}
