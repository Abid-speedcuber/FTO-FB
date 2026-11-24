import React, { useEffect, useRef, useState } from "react";
import { readSession, writeSession, VIEWER_SESSION_KEY } from "./session.js";
import { DEFAULT_CIF_FRAME, frameForCamera, snappedViewRotation } from "./vendor/orientation.js";
import { moveNamesForFrame } from "./view-notation.js";
import { PuzzleViewer } from "./vendor/puzzle-viewer.js";
import {
  solvedState,
  applyMove,
  moves,
  candidateMask,
} from "./model/fto.js";
export default function Viewer({
  scramble,
  colors,
  mode,
  setup,
  solution,
  selectionKey,
  active = true,
  onFrameChange,
  onViewInteraction,
  viewRequest,
}) {
  const [frame, setFrame] = useState(DEFAULT_CIF_FRAME);
  const frameCallback = useRef(), interactionCallback = useRef(), applyingHold = useRef(false);
  frameCallback.current = onFrameChange;
  interactionCallback.current = onViewInteraction;
  const moveNames = moveNamesForFrame(frame);
  const [saved] = useState(() => readSession(VIEWER_SESSION_KEY));
  const host = useRef(),
    viewer = useRef(),
    frames = useRef([]),
    raf = useRef(),
    index = useRef(0),
    playing = useRef(false);
  const [step, setStep] = useState(0),
    [isPlaying, setPlaying] = useState(false),
    [speed, setSpeed] = useState([250, 500, 900].includes(saved?.speed) ? saved.speed : 500),
    [error, setError] = useState(""),
    [backStickers, setBackStickers] = useState(saved?.backStickers !== false);
  const mask = useRef(),
    homeView = useRef(),
    firstFrame = useRef(true),
    context = useRef(null),
    turnProgress = useRef(0),
    saveTimer = useRef(),
    saveLatest = useRef();
  saveLatest.current = () => {
    if (!context.current || !viewer.current) return;
    writeSession(VIEWER_SESSION_KEY, {
      signature: context.current, step: index.current, progress: turnProgress.current,
      camera: viewer.current.view(), speed, backStickers,
    });
  };
  const scheduleSave = () => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveLatest.current(), 150);
  };
  const halt = () => {
    cancelAnimationFrame(raf.current);
    playing.current = false;
    setPlaying(false);
    scheduleSave();
  };
  const show = (i) => {
    halt();
    index.current = i;
    turnProgress.current = 0;
    setStep(i);
    viewer.current?.setPuzzle(3, frames.current[i], mask.current);
  };
  useEffect(() => {
    try {
      viewer.current = new PuzzleViewer(host.current, { showBackStickers: backStickers });
      viewer.current.resize();
      homeView.current = viewer.current.view();
      if (Array.isArray(saved?.camera?.rotation) && saved.camera.rotation.length === 4 &&
          saved.camera.rotation.every(Number.isFinite) && saved.camera.rotation.some((v) => v !== 0) &&
          saved.camera.radius >= 6 && saved.camera.radius <= 20) viewer.current.setView(saved.camera);
      const updateFrame = () => {
        const next = frameForCamera(viewer.current.camera);
        setFrame(next);
        frameCallback.current?.(next);
        if (!applyingHold.current) interactionCallback.current?.(next);
        scheduleSave();
      };
      viewer.current.controls.addEventListener("change", updateFrame);
      updateFrame();
    } catch (e) {
      setError(`3D viewer unavailable: ${e.message}`);
    }
    const flush = () => saveLatest.current();
    const hide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hide);
    return () => {
      flush();
      clearTimeout(saveTimer.current);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hide);
      cancelAnimationFrame(raf.current);
      viewer.current?.dispose();
    };
  }, []);
  useEffect(() => {
    halt();
    let state = solvedState(3);
    for (const m of scramble) state = applyMove(state, moves[m]);
    frames.current = [state];
    for (const m of solution?.moves ?? []) {
      state = applyMove(state, moves[m]);
      frames.current.push(state);
    }
    const visibleColors = solution ? [solution.color] : setup ? colors : [];
    mask.current = new Set(visibleColors.flatMap((color) => [...candidateMask(color, mode)]));
    const signature = JSON.stringify([scramble, colors, mode, setup, solution?.moves, solution?.color]);
    const restoring = firstFrame.current && saved?.signature === signature;
    const restoredStep = restoring && Number.isInteger(saved.step)
      ? Math.max(0, Math.min(saved.step, frames.current.length - 1)) : 0;
    index.current = restoredStep;
    turnProgress.current = restoring && restoredStep < (solution?.moves.length ?? 0) &&
      Number.isFinite(saved.progress) ? Math.max(0, Math.min(saved.progress, 1)) : 0;
    context.current = signature;
    setStep(restoredStep);
    viewer.current?.setPuzzle(3, frames.current[restoredStep], mask.current,
      turnProgress.current ? [{ move: moves[solution.moves[restoredStep]], progress: turnProgress.current }] : []);
    if (solution && !firstFrame.current && active) raf.current = requestAnimationFrame(() => play());
    firstFrame.current = false;
    scheduleSave();
  }, [scramble, colors, mode, setup, solution, selectionKey]);
  useEffect(() => {
    if (!active) halt();
  }, [active]);
  useEffect(scheduleSave, [speed, backStickers]);
  useEffect(() => {
    if (!viewRequest || !viewer.current) return;
    applyingHold.current = true;
    try {
      viewer.current.setView({
        ...viewer.current.view(), rotation: snappedViewRotation(viewRequest.frame).toArray(),
      });
    } finally { applyingHold.current = false; }
  }, [viewRequest]);
  function play() {
    if (!solution?.moves.length) return;
    halt();
    if (index.current >= solution.moves.length) {
      index.current = 0;
      turnProgress.current = 0;
      setStep(0);
    }
    playing.current = true;
    setPlaying(true);
    let started;
    function tick(time) {
      if (!playing.current) return;
      if (started === undefined) started = time - turnProgress.current * speed;
      const p = Math.max(0, Math.min(1, (time - started) / speed)),
        i = index.current;
      turnProgress.current = p;
      scheduleSave();
      viewer.current?.setPuzzle(3, frames.current[i], mask.current, [
        { move: moves[solution.moves[i]], progress: p },
      ]);
      if (p === 1) {
        index.current++;
        turnProgress.current = 0;
        setStep(index.current);
        viewer.current?.setPuzzle(
          3,
          frames.current[index.current],
          mask.current,
        );
        started = time + 100;
        if (index.current === solution.moves.length) {
          halt();
          return;
        }
      }
      raf.current = requestAnimationFrame(tick);
    }
    raf.current = requestAnimationFrame(tick);
  }
  return (
    <div className="viewer-panel">
      <div className="stage-head">
        <label className="back-stickers">
          <input
            type="checkbox"
            checked={backStickers}
            onChange={(e) => {
              setBackStickers(e.target.checked);
              viewer.current?.setBackStickers(e.target.checked);
            }}
          />
          Back stickers
        </label>
        <div className="view-actions">
          <button
            className="quiet"
            onClick={() => viewer.current?.setView(homeView.current)}
          >
            Reset View
          </button>
        </div>
      </div>
      <div className="stage" ref={host} />
      {error && <p role="alert">{error}</p>}
      <div className="timeline">
        {solution ? (
          solution.moves.length ? (
            solution.moves.map((m, i) => (
              <button
                key={i}
                onClick={() => show(i + 1)}
                className={i < step ? "played" : i === step ? "next" : ""}
              >
                {moveNames[m]}
              </button>
            ))
          ) : (
            <span>Already complete</span>
          )
        ) : null}
      </div>
      <div className="transport">
        <button
          title="Back to scramble"
          aria-label="Back to scramble"
          onClick={() => show(0)}
          disabled={!solution}
        >
          ↶
        </button>
        <button
          title="Previous move"
          aria-label="Previous move"
          disabled={!step}
          onClick={() => show(step - 1)}
        >
          ‹
        </button>
        <button
          className="play"
          onClick={() => (isPlaying ? halt() : play())}
          disabled={!solution?.moves.length}
        >
          {isPlaying ? "Ⅱ Pause" : "▶ Play"}
        </button>
        <button
          title="Next move"
          aria-label="Next move"
          disabled={!solution || step === solution.moves.length}
          onClick={() => show(step + 1)}
        >
          ›
        </button>
        <span className="step-count">
          {step} / {solution?.moves.length ?? 0}
        </span>
        <select
          aria-label="Playback speed"
          value={speed}
          onChange={(e) => {
            halt();
            setSpeed(+e.target.value);
          }}
        >
          <option value="900">0.5×</option>
          <option value="500">1×</option>
          <option value="250">2×</option>
        </select>
      </div>
    </div>
  );
}
