"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HoldRing } from "@/components/hold-ring";
import { Button } from "@/components/ui/button";
import { HandMark, LampMark, Sprocket } from "@/components/icons";
import { useVision } from "@/hooks/use-vision";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { formatClock, formatSpan } from "@/lib/format";
import type { PoseName } from "@/lib/gestures";
import { ACTION_KINDS, pickProposal, phraseProposal, type ActionKind, type Proposal } from "@/lib/proposals";
import { applyProposal, emptySandbox, recordLog, type Sandbox } from "@/lib/sandbox";
import { sampleById, samples, type SampleFilm } from "@/lib/samples";
import {
  HOLD_MS,
  holdProgress,
  initialSession,
  reduceSession,
  type SessionEffect,
  type SessionState,
} from "@/lib/session";
import { summariseCues, summariseGap, type SummaryResult } from "@/lib/summarize";
import { parseVtt, type Cue } from "@/lib/vtt";

export type PublicState = {
  mode: SessionState["mode"];
  playback: SessionState["playback"];
  attention: SessionState["attention"];
  holdProgress: number;
  holdIntent: "approve" | "reject" | null;
  proposal: Proposal | null;
  stamp: string | null;
  missed: { from: number; to: number; text: string } | null;
  captionsOn: boolean;
  logCount: number;
};

declare global {
  interface Window {
    __lazyHands?: {
      getState: () => PublicState;
      pose: (pose: PoseName, dt: number) => void;
      swipe: (dir: "left" | "right") => void;
      propose: (kind: ActionKind) => void;
      face: (visible: boolean) => void;
      missKey: () => void;
      loadSample: (id: SampleFilm["id"]) => void;
      setTime: (seconds: number) => void;
    };
  }
}

type Source = {
  title: string;
  src: string;
  captionsUrl?: string;
  introEnd: number | null;
  credit?: string;
};

export function Studio() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastTick = useRef(performance.now());
  const lastProposalAt = useRef(0);
  const already = useRef(new Set<ActionKind>());
  const [session, setSession] = useState<SessionState>(() => initialSession(0));
  const [sandbox, setSandbox] = useState<Sandbox>(() => emptySandbox());
  const [source, setSource] = useState<Source | null>(null);
  const [cues, setCues] = useState<Cue[]>([]);
  const [nowPlaying, setNowPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [miss, setMiss] = useState<SummaryResult & { from: number; to: number } | null>(null);
  const [missLoading, setMissLoading] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [dropHint, setDropHint] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const applyEffects = useCallback((effects: SessionEffect[]) => {
    const video = videoRef.current;
    for (const effect of effects) {
      if (effect.type === "toggle_playback") {
        if (!video) continue;
        if (video.paused) void video.play();
        else video.pause();
      }
      if (effect.type === "set_playback") {
        if (!video) continue;
        if (effect.playing) void video.play();
        else video.pause();
      }
      if (effect.type === "seek" && video) {
        video.currentTime = Math.max(0, video.currentTime + effect.seconds);
      }
      if (effect.type === "apply_proposal") {
        setSandbox((box) => {
          const next = applyProposal(box, effect.proposal);
          if (next.seekTo != null && video) video.currentTime = next.seekTo;
          if (next.summariseLast != null && video) {
            const from = Math.max(0, video.currentTime - next.summariseLast);
            void runSummary(from, video.currentTime);
          }
          return next;
        });
      }
      if (effect.type === "log") {
        setSandbox((box) => recordLog(box, effect.entry));
      }
      if (effect.type === "summarise") {
        void runSummary(effect.from, effect.to);
      }
    }
  }, []);

  const dispatch = useCallback(
    (event: Parameters<typeof reduceSession>[1], videoTime?: number) => {
      const now = performance.now();
      const vt = videoTime ?? videoRef.current?.currentTime ?? 0;
      const { state, effects } = reduceSession(sessionRef.current, event, now, vt);
      sessionRef.current = state;
      setSession(state);
      applyEffects(effects);
    },
    [applyEffects],
  );

  async function runSummary(from: number, to: number) {
    setMissLoading(true);
    setError(null);
    try {
      const slice = cues.filter((c) => c.end > from && c.start < to);
      const transcript = slice.map((c) => c.text).join(" ");
      const allowWeights = process.env.NEXT_PUBLIC_FORCE_EXTRACTIVE !== "1";
      const result = allowWeights
        ? await summariseGap(transcript, { allowRemoteWeights: true })
        : summariseCues(cues, from, to);
      setMiss({ ...result, from, to });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The recap failed.");
      const fallback = summariseCues(cues, from, to);
      setMiss({ ...fallback, from, to });
    } finally {
      setMissLoading(false);
    }
  }

  const loadCaptions = useCallback(async (url: string) => {
    const res = await fetch(url);
    const text = await res.text();
    setCues(parseVtt(text));
  }, []);

  const loadSample = useCallback(
    async (id: SampleFilm["id"]) => {
      const film = sampleById(id);
      if (!film) return;
      already.current = new Set();
      lastProposalAt.current = 0;
      setMiss(null);
      setSandbox(emptySandbox());
      setSession(initialSession(performance.now()));
      setSource({
        title: film.title,
        src: film.src,
        captionsUrl: film.captions,
        introEnd: film.introEnd,
        credit: film.credit,
      });
      await loadCaptions(film.captions);
    },
    [loadCaptions],
  );

  const onHand = useCallback(
    (pose: PoseName, swipe: "left" | "right" | null, _latency: number) => {
      const now = performance.now();
      const dt = Math.min(80, now - lastTick.current);
      lastTick.current = now;
      if (swipe && sessionRef.current.mode === "watching") {
        dispatch({ type: "swipe", dir: swipe });
        return;
      }
      dispatch({ type: "pose", pose, dt });
    },
    [dispatch],
  );

  const onFace = useCallback(
    (visible: boolean) => {
      const now = performance.now();
      const dt = Math.min(80, now - lastTick.current);
      dispatch({ type: "face", visible, dt, videoTime: videoRef.current?.currentTime ?? 0 });
    },
    [dispatch],
  );

  const vision = useVision(cameraOn, onHand, onFace);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (sessionRef.current.mode === "watching") {
          dispatch({ type: "pose", pose: "open_palm", dt: 200 });
          dispatch({ type: "pose", pose: "none", dt: 20 });
        }
      }
      if (e.key === "m" || e.key === "M") {
        dispatch({ type: "miss_key", videoTime: videoRef.current?.currentTime ?? 0 });
      }
      if (e.key === "ArrowLeft") dispatch({ type: "swipe", dir: "left" });
      if (e.key === "ArrowRight") dispatch({ type: "swipe", dir: "right" });
      if (e.key === "y" || e.key === "Y") dispatch({ type: "pose", pose: "thumbs_up", dt: 40 });
      if (e.key === "n" || e.key === "N") dispatch({ type: "pose", pose: "open_palm", dt: 40 });
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === "y" || e.key === "Y" || e.key === "n" || e.key === "N") {
        dispatch({ type: "pose", pose: "none", dt: 16 });
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  }, [dispatch]);

  useEffect(() => {
    const holdY = { current: false };
    const holdN = { current: false };
    let raf = 0;
    const tick = () => {
      if (holdY.current) dispatch({ type: "pose", pose: "thumbs_up", dt: 32 });
      if (holdN.current) dispatch({ type: "pose", pose: "open_palm", dt: 32 });
      raf = requestAnimationFrame(tick);
    };
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === "y" || e.key === "Y") holdY.current = true;
      if (e.key === "n" || e.key === "N") holdN.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "y" || e.key === "Y") holdY.current = false;
      if (e.key === "n" || e.key === "N") holdN.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [dispatch]);

  useEffect(() => {
    if (!source || session.mode !== "watching" || session.attention !== "present") return;
    if (performance.now() - lastProposalAt.current < 7000) return;
    const proposal = pickProposal({
      videoTime: time,
      duration,
      captionsOn: sandbox.captionsOn,
      bookmarkCount: sandbox.bookmarks.length,
      noteCount: sandbox.notes.length,
      introEnd: source.introEnd,
      already: already.current,
      mode: session.mode,
      attention: session.attention,
    });
    if (!proposal) return;
    already.current.add(proposal.kind);
    lastProposalAt.current = performance.now();
    dispatch({ type: "propose", proposal });
  }, [source, time, duration, sandbox, session.mode, session.attention, dispatch]);

  useEffect(() => {
    window.__lazyHands = {
      getState: () => ({
        mode: sessionRef.current.mode,
        playback: sessionRef.current.playback,
        attention: sessionRef.current.attention,
        holdProgress: holdProgress(sessionRef.current),
        holdIntent: sessionRef.current.approval?.hold?.intent ?? null,
        proposal: sessionRef.current.approval?.proposal ?? null,
        stamp: sessionRef.current.lastStamp?.label ?? null,
        missed: miss ? { from: miss.from, to: miss.to, text: miss.text } : null,
        captionsOn: sandbox.captionsOn,
        logCount: sandbox.log.length,
      }),
      pose: (pose, dt) => dispatch({ type: "pose", pose, dt }),
      swipe: (dir) => dispatch({ type: "swipe", dir }),
      propose: (kind) => {
        if (!ACTION_KINDS.includes(kind)) return;
        dispatch({
          type: "propose",
          proposal: phraseProposal(kind, {
            videoTime: videoRef.current?.currentTime ?? 0,
            introEnd: source?.introEnd ?? 8,
            captionsOn: sandbox.captionsOn,
          }),
        });
      },
      face: (visible) =>
        dispatch({
          type: "face",
          visible,
          dt: visible ? 20 : 1000,
          videoTime: videoRef.current?.currentTime ?? 0,
        }),
      missKey: () => dispatch({ type: "miss_key", videoTime: videoRef.current?.currentTime ?? 0 }),
      loadSample: (id) => void loadSample(id),
      setTime: (seconds) => {
        if (videoRef.current) videoRef.current.currentTime = seconds;
        setTime(seconds);
      },
    };
    return () => {
      delete window.__lazyHands;
    };
  }, [dispatch, loadSample, miss, sandbox, source]);

  useEffect(() => {
    if (session.lastStamp && performance.now() - session.lastStamp.at > 1400) {
      dispatch({ type: "clear_stamp" });
    }
  }, [session.lastStamp, dispatch]);

  const onFiles = async (files: File[]) => {
    const video = files.find((f) => f.type.startsWith("video/") || /\.(mp4|webm|ogg|mov)$/i.test(f.name));
    const vtt = files.find((f) => f.name.toLowerCase().endsWith(".vtt"));
    if (!video) {
      setError("Drop a video file, and a .vtt if you have one.");
      return;
    }
    already.current = new Set();
    setMiss(null);
    setSandbox(emptySandbox());
    setSession(initialSession(performance.now()));
    setSource({
      title: video.name.replace(/\.[^.]+$/, ""),
      src: URL.createObjectURL(video),
      introEnd: 8,
    });
    if (vtt) setCues(parseVtt(await vtt.text()));
    else setCues([]);
  };

  const progress = holdProgress(session);
  const proposal = session.approval?.proposal ?? null;
  const lampLit = vision.status === "live" && (vision.seeingFace || vision.seeingHand);

  const publicCue = useMemo(() => {
    return cues.find((c) => time >= c.start && time < c.end)?.text ?? "";
  }, [cues, time]);

  return (
    <div
      className="min-h-dvh"
      onDragOver={(e) => {
        e.preventDefault();
        setDropHint(true);
      }}
      onDragLeave={() => setDropHint(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropHint(false);
        void onFiles([...e.dataTransfer.files]);
      }}
    >
      <div className="mx-auto flex min-h-dvh max-w-[1280px] flex-col gap-4 px-4 py-5 md:flex-row md:gap-7 md:px-7 md:py-7">
        <aside className="ticket-rail relative w-full shrink-0 md:w-[168px]">
          <div className="relative overflow-hidden rounded-[2px] border border-[var(--walnut)]/25 bg-[var(--ticket)] px-4 py-5 shadow-[3px_3px_0_rgba(106,64,36,0.28)] md:min-h-[calc(100dvh-3.5rem)]">
            <Sprocket className="absolute right-3 top-3 h-5 w-5 text-[var(--walnut)]/40" />
            <p className="font-display text-[11px] uppercase tracking-[0.28em] text-[var(--walnut)]">Sunday reel</p>
            <h1 className="mt-3 font-display text-[2.35rem] leading-[0.9] text-[var(--ink)] italic">{brand.name}</h1>
            <p className="mt-4 text-[13px] leading-5 text-[var(--ink)]/80">{brand.tagline}</p>
            <ol className="mt-8 space-y-3 text-[12.5px] leading-5 text-[var(--ink)]/85">
              <li>
                <span className="font-display italic">Palm</span> pulse to pause.
              </li>
              <li>
                <span className="font-display italic">Swipe</span> to skip ten seconds.
              </li>
              <li>
                <span className="font-display italic">Thumb</span> held to approve.
              </li>
              <li>
                <span className="font-display italic">Palm held</span> to refuse.
              </li>
              <li>
                Look away, or press <kbd className="rounded-[2px] bg-[var(--cream)] px-1">M</kbd>.
              </li>
            </ol>
            <div className="mt-8 border-t border-dashed border-[var(--walnut)]/30 pt-4 text-[12px] leading-5">
              <p className="font-display italic text-[var(--walnut)]">This tab only</p>
              <p className="mt-1 text-[var(--ink)]/75">Hands, face, and captions stay on this device. The model never phones home.</p>
            </div>
            {sandbox.log[0] ? (
              <p className="mt-6 text-[11px] uppercase tracking-[0.16em] text-[var(--walnut)]">
                Last: {sandbox.log[0].decision} · {sandbox.log[0].kind.replaceAll("_", " ")}
              </p>
            ) : null}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="font-display text-[13px] italic text-[var(--walnut)]">
                {source ? source.title : "Nothing queued"}
              </p>
              {source?.credit ? <p className="max-w-xl text-[11px] leading-4 text-[var(--ink)]/60">{source.credit}</p> : null}
            </div>
            <div className="flex items-center gap-2">
              <div
                className="lamp-chip flex items-center gap-2 rounded-[3px] border border-[var(--walnut)]/20 bg-[var(--cream)] px-2.5 py-1"
                data-testid="camera-lamp"
                data-status={vision.status}
                data-face={vision.seeingFace ? "1" : "0"}
              >
                <LampMark className="h-5 w-5 text-[var(--walnut)]" lit={lampLit} />
                <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink)]/70">
                  {vision.status === "live"
                    ? vision.seeingFace
                      ? "Sees you"
                      : vision.seeingHand
                        ? "Sees a hand"
                        : "Looking"
                    : vision.status === "asking"
                      ? "Asking"
                      : vision.status === "denied"
                        ? "Lamp out"
                        : vision.status === "failed"
                          ? "Lamp failed"
                          : "Lamp idle"}
                </span>
              </div>
              <Button variant="quiet" onClick={() => setCameraOn((v) => !v)}>
                {cameraOn ? "Rest the camera" : "Wake the camera"}
              </Button>
            </div>
          </header>

          <section
            className={cn(
              "film-frame relative overflow-hidden bg-[var(--walnut)]",
              dropHint && "outline outline-2 outline-offset-4 outline-[var(--rust)]",
            )}
          >
            <div className="relative aspect-video bg-[#2a1c12]">
              {source ? (
                <video
                  ref={videoRef}
                  className="h-full w-full object-cover"
                  src={source.src}
                  playsInline
                  crossOrigin="anonymous"
                  onPlay={() => {
                    setNowPlaying(true);
                    dispatch({ type: "play" });
                  }}
                  onPause={() => {
                    setNowPlaying(false);
                    dispatch({ type: "pause" });
                  }}
                  onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
                  onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
                  onError={() => setError("This file would not play in the browser.")}
                >
                  {source.captionsUrl && sandbox.captionsOn ? (
                    <track kind="subtitles" srcLang="en" src={source.captionsUrl} default />
                  ) : null}
                </video>
              ) : (
                <EmptyStage onPick={loadSample} onFiles={onFiles} />
              )}

              {session.lastStamp ? (
                <div className="gesture-stamp" data-testid="gesture-stamp">
                  {session.lastStamp.label}
                </div>
              ) : null}

              {session.attention === "away" ? (
                <p className="absolute left-3 top-3 rounded-[2px] bg-[var(--cream)] px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--rust)]">
                  Away from {formatClock(session.awayFromVideoTime ?? time)}
                </p>
              ) : null}

              {sandbox.captionsOn && publicCue && !source?.captionsUrl ? (
                <p className="absolute inset-x-8 bottom-6 text-center font-display text-lg text-[var(--cream)]">
                  {publicCue}
                </p>
              ) : null}
            </div>
          </section>

          {source ? (
            <div className="mt-3 flex items-center gap-3">
              <span className="w-12 font-display text-sm tabular-nums">{formatClock(time)}</span>
              <input
                aria-label="Position"
                type="range"
                min={0}
                max={duration || 1}
                step={0.1}
                value={Math.min(time, duration || 0)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (videoRef.current) videoRef.current.currentTime = v;
                  setTime(v);
                }}
                className="scrub h-2 flex-1"
              />
              <span className="w-12 text-right font-display text-sm tabular-nums">{formatClock(duration)}</span>
              <Button
                variant="rust"
                className="rounded-[3px]"
                onClick={() => {
                  const v = videoRef.current;
                  if (!v) return;
                  if (v.paused) void v.play();
                  else v.pause();
                }}
              >
                {nowPlaying ? "Pause" : "Play"}
              </Button>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-[var(--ink)]/70">
              {samples.map((film) => (
                <button
                  key={film.id}
                  className="text-left hover:text-[var(--rust)]"
                  onClick={() => void loadSample(film.id)}
                >
                  <span className="font-display italic">{film.title}</span>
                  <span className="ml-2 text-[11px] uppercase tracking-[0.12em]">
                    {film.reel} · {film.license}
                  </span>
                </button>
              ))}
              <label className="cursor-pointer hover:text-[var(--rust)]">
                Open a file
                <input
                  type="file"
                  accept="video/*,.vtt"
                  multiple
                  className="sr-only"
                  onChange={(e) => void onFiles([...(e.target.files ?? [])])}
                />
              </label>
            </div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--walnut)]">
              {sandbox.bookmarks.length} marks · {sandbox.notes.length} notes
            </p>
          </div>

          {error ? (
            <p className="mt-3 rounded-[2px] bg-[#f3d7c4] px-3 py-2 text-sm text-[var(--rust-deep)]" role="alert">
              {error}
            </p>
          ) : null}

          <div className="relative mt-4 min-h-[8rem]">
            {proposal ? (
              <article
                className="approval-card"
                data-testid="approval-card"
                data-kind={proposal.kind}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-display text-[11px] uppercase tracking-[0.22em] text-[var(--brass)]">
                      The model asks
                    </p>
                    <h2 className="mt-2 font-display text-[1.65rem] leading-8 italic">{proposal.title}</h2>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--ink)]/80">{proposal.detail}</p>
                    <p className="mt-3 text-[12px] text-[var(--walnut)]">
                      Hold a thumb up to agree. Hold an open palm to stop. About {HOLD_MS / 1000}s, so a twitch does not count.
                    </p>
                  </div>
                  <HoldRing progress={progress} intent={session.approval?.hold?.intent ?? null} />
                </div>
              </article>
            ) : null}

            {miss || missLoading ? (
              <article className={cn("miss-card", proposal && "mt-3")} data-testid="miss-card">
                <p className="font-display text-[12px] uppercase tracking-[0.18em] text-[var(--rust)]">
                  {missLoading
                    ? "Reading the gap"
                    : `You missed ${formatSpan((miss?.to ?? 0) - (miss?.from ?? 0))}`}
                </p>
                {missLoading ? (
                  <p className="mt-2 text-sm text-[var(--ink)]/70">The local model is gathering the captions.</p>
                ) : (
                  <>
                    <p className="mt-2 max-w-2xl text-[1.05rem] leading-7">{miss?.text}</p>
                    <p className="mt-3 text-[11px] uppercase tracking-[0.14em] text-[var(--walnut)]">
                      {miss?.note} · {Math.round(miss?.latencyMs ?? 0)} ms
                    </p>
                  </>
                )}
              </article>
            ) : null}
          </div>
        </main>
      </div>

      <video ref={vision.videoRef} className="pointer-events-none absolute h-px w-px opacity-0" muted playsInline />
      <HandMark className="sr-only" />
    </div>
  );
}

function EmptyStage({
  onPick,
  onFiles,
}: {
  onPick: (id: SampleFilm["id"]) => void;
  onFiles: (files: File[]) => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center text-[var(--cream)]">
      <p className="font-display text-3xl italic">Drop a film, or pick a reel</p>
      <p className="mt-2 max-w-md text-sm text-[var(--cream)]/70">
        A local file plus a .vtt works. Two Blender trailers are already here, credited on the ticket.
      </p>
      <div className="mt-6 flex flex-col items-stretch gap-2 sm:flex-row">
        {samples.map((film) => (
          <button
            key={film.id}
            onClick={() => onPick(film.id)}
            className="rounded-[2px] bg-[var(--cream)] px-4 py-3 text-left text-[var(--ink)] shadow-[4px_4px_0_#1f140c]"
          >
            <span className="block font-display text-lg italic">{film.title}</span>
            <span className="block text-[11px] uppercase tracking-[0.14em] text-[var(--walnut)]">
              {film.durationLabel} · {film.license}
            </span>
          </button>
        ))}
      </div>
      <label className="mt-4 cursor-pointer text-sm underline decoration-[var(--brass)] underline-offset-4">
        Or open from disk
        <input
          type="file"
          accept="video/*,.vtt"
          multiple
          className="sr-only"
          onChange={(e) => onFiles([...(e.target.files ?? [])])}
        />
      </label>
    </div>
  );
}
