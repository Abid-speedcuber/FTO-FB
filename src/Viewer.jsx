import React, { useEffect, useRef, useState } from "react";
import { PuzzleViewer } from "./vendor/puzzle-viewer.js";
import {
  solvedState,
  applyMove,
  moves,
  solutionMask,
  stickerPositions,
  FACES,
} from "./model/fto.js";
export default function Viewer({ scramble, solution, selectionKey }) {
  const host = useRef(),
    viewer = useRef(),
    frames = useRef([]),
    raf = useRef(),
    index = useRef(0),
    playing = useRef(false);
  const [step, setStep] = useState(0),
    [isPlaying, setPlaying] = useState(false),
    [speed, setSpeed] = useState(500),
    [error, setError] = useState(""),
    [backStickers, setBackStickers] = useState(true);
  const mask = useRef(),
    homeView = useRef();
  const halt = () => {
    cancelAnimationFrame(raf.current);
    playing.current = false;
    setPlaying(false);
  };
  const show = (i) => {
    halt();
    index.current = i;
    setStep(i);
    viewer.current?.setPuzzle(3, frames.current[i], mask.current);
  };
  useEffect(() => {
    try {
      viewer.current = new PuzzleViewer(host.current);
      viewer.current.resize();
      homeView.current = viewer.current.view();
    } catch (e) {
      setError(`3D viewer unavailable: ${e.message}`);
    }
    return () => {
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
    mask.current = solutionMask(
      stickerPositions([...scramble, ...(solution?.moves ?? [])]),
      solution?.target,
    );
    index.current = 0;
    setStep(0);
    viewer.current?.setPuzzle(3, frames.current[0], mask.current);
    if (solution) raf.current = requestAnimationFrame(() => play());
  }, [scramble, solution, selectionKey]);
  function play() {
    if (!solution?.moves.length) return;
    halt();
    if (index.current >= solution.moves.length) {
      index.current = 0;
      setStep(0);
    }
    playing.current = true;
    setPlaying(true);
    let started;
    function tick(time) {
      if (!playing.current) return;
      if (started === undefined) started = time;
      const p = Math.max(0, Math.min(1, (time - started) / speed)),
        i = index.current;
      viewer.current?.setPuzzle(3, frames.current[i], mask.current, [
        { move: moves[solution.moves[i]], progress: p },
      ]);
      if (p === 1) {
        index.current++;
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
            disabled={!solution}
            onClick={() =>
              viewer.current?.face(
                FACES[
                  Math.floor(
                    solution.target.first.find(
                      ([, c]) => c === solution.color,
                    )[0] / 9,
                  )
                ].normal,
              )
            }
          >
            View block
          </button>
          <button
            className="quiet"
            onClick={() => viewer.current?.setView(homeView.current)}
          >
            CIF
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
                {moves[m].name}
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
