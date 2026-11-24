import React, { useEffect, useMemo, useRef, useState } from "react";
import { CASE_SESSION_KEY, readSession } from "./session.js";
import { useSession } from "./use-session.js";
import { DEFAULT_CIF_FRAME, frameForCamera } from "./vendor/orientation.js";
import { formatAlgorithm } from "./view-notation.js";
import { PuzzleViewer } from "./vendor/puzzle-viewer.js";
import { moves, parseScramble } from "./model/fto.js";
import {
  CASE_MODES,
  caseFrames,
  mirrorAlgorithm,
  partialTarget,
  partialKey,
  applyPartial,
  inverseAlgorithm,
} from "./model/cases.js";
import { CaseSnapshots, CASE_CAMERA_RADIUS } from "./case-snapshots.js";

function CasePlayer({ target, solution, playSignal, action, onPlaying, onStep, onFrameChange, visible }) {
  const host = useRef(),
    viewer = useRef(),
    raf = useRef(),
    index = useRef(0),
    playing = useRef(false),
    inTurn = useRef(false),
    cameraView = useRef(null),
    frameCallback = useRef();
  frameCallback.current = onFrameChange;
  const parts = useMemo(() => caseFrames(target, solution), [target, solution]);
  function pause() {
    cancelAnimationFrame(raf.current);
    playing.current = false;
    onPlaying(false);
  }
  function play() {
    if (!viewer.current || !solution.length) return;
    pause();
    if (index.current >= solution.length) {
      index.current = 0;
      onStep(0);
    }
    playing.current = true;
    onPlaying(true);
    let start;
    function tick(time) {
      if (!playing.current) return;
      if (start === undefined) start = time;
      const p = Math.max(0, Math.min(1, (time - start) / 450)),
        i = index.current;
      if (p > 0 && !inTurn.current) {
        inTurn.current = true;
        onStep(index.current, true);
      }
      viewer.current.setPuzzle(3, parts.frames[i], parts.mask, [
        { move: moves[solution[i]], progress: p },
      ]);
      if (p === 1) {
        index.current++;
        inTurn.current = false;
        onStep(index.current);
        viewer.current.setPuzzle(3, parts.frames[index.current], parts.mask);
        if (index.current === solution.length) {
          pause();
          return;
        }
        start = time + 100;
      }
      raf.current = requestAnimationFrame(tick);
    }
    raf.current = requestAnimationFrame(tick);
  }
  useEffect(() => {
    index.current = 0;
    inTurn.current = false;
    onStep(0);
    try {
      viewer.current = new PuzzleViewer(host.current, { fitToView: true });
      viewer.current.resize();
      viewer.current.setFrame(3, parts.frames[0], parts.mask, [], cameraView.current ?? {
        ...viewer.current.view(), radius: CASE_CAMERA_RADIUS,
      });
      const updateFrame = () => frameCallback.current?.(frameForCamera(viewer.current.camera));
      viewer.current.controls.addEventListener("change", updateFrame);
      updateFrame();
    } catch (error) {
      host.current.textContent = "3D preview unavailable";
    }
    return () => {
      pause();
      if (viewer.current) cameraView.current = viewer.current.view();
      viewer.current?.dispose();
      viewer.current = null;
    };
  }, [parts]);
  useEffect(() => {
    if (!playSignal) return;
    if (action === "previous" || action === "next") {
      pause();
      index.current = Math.max(0, Math.min(solution.length,
        index.current + (action === "next" ? 1 : inTurn.current ? 0 : -1)));
      inTurn.current = false;
      viewer.current?.setPuzzle(3, parts.frames[index.current], parts.mask);
      onStep(index.current);
    } else {
      if (playing.current) pause();
      else play();
    }
  }, [playSignal]);
  useEffect(() => {
    if (!visible) pause();
  }, [visible]);
  return <div className="case-live" ref={host} />;
}
function CaseCard({
  entry,
  target,
  mode,
  revision,
  index,
  mirrored,
  active,
  activate,
  pool,
  visible,
}) {
  const article = useRef(),
    [near, setNear] = useState(false),
    [image, setImage] = useState(""),
    [error, setError] = useState(""),
    [playing, setPlaying] = useState(false),
    [step, setStep] = useState(0),
    [turning, setTurning] = useState(false),
    [selectedSolution, setSelectedSolution] = useState(0),
    [frame, setFrame] = useState(DEFAULT_CIF_FRAME);
  const solutions = useMemo(() => entry.solutions.map((text) => {
    const algorithm = parseScramble(text);
    return mirrored ? mirrorAlgorithm(algorithm) : algorithm;
  }), [entry.solutions, mirrored]);
  const solution = solutions[selectedSolution];
  const key = `${mode}:${entry.id}:${mirrored ? "mirror" : "base"}`;
  const snapshotKey = useMemo(
    () =>
      `${revision}:${mode}:${partialKey(applyPartial(partialTarget(target), inverseAlgorithm(solution)))}`,
    [target, solution, mode, revision],
  );
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(article.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    pool
      .request(snapshotKey, target, solution)
      .then((url) => {
        if (!cancelled) setImage(url);
      })
      .catch(() => {
        if (!cancelled) setError("Preview unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [near, pool, snapshotKey, target, solution]);
  const focused = active.key === key;
  const displayFrame = focused ? frame : DEFAULT_CIF_FRAME;
  return (
    <article
      ref={article}
      className={`case-card ${focused ? "focused" : ""}`}
      tabIndex={0}
      onFocus={() => activate(key, false)}
      aria-label={`Case ${index + 1}${mirrored ? ", mirror" : ""}`}
    >
      <div className="case-copy">
        <div className="case-meta">
          <span>#{index + 1}</span>
          {mirrored && <span>Mirror</span>}
        </div>
        {entry.name && <h2>{entry.name}</h2>}
        <div className="case-solutions">
          {solutions.length === 1 ? (
            <div className="case-algorithm">{formatAlgorithm(solution, displayFrame)}</div>
          ) : solutions.map((algorithm, i) => (
            <button type="button" key={i} className="case-alternative case-algorithm"
              aria-pressed={selectedSolution === i}
              aria-label={`Solution ${i + 1}: ${formatAlgorithm(algorithm, displayFrame)}`}
              onClick={() => { setSelectedSolution(i); activate(key, false); }}>
              {formatAlgorithm(algorithm, displayFrame)}
            </button>
          ))}
        </div>
        <div className="case-transport" role="group" aria-label="Solution playback">
          <button type="button" aria-label="Previous move" title="Previous move"
            disabled={!focused || (step === 0 && !turning)}
            onClick={() => activate(key, "previous")}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5v10m9-10-6 5 6 5Z" /></svg>
          </button>
          <button type="button" className="case-play"
            aria-label={focused && playing ? "Pause" : "Play"}
            title={focused && playing ? "Pause" : "Play"}
            onClick={() => activate(key, true)}>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              {focused && playing
                ? <path d="M7 5v10m6-10v10" />
                : <path d="m7 4 9 6-9 6Z" />}
            </svg>
          </button>
          <button type="button" aria-label="Next move" title="Next move"
            disabled={focused && step === solution.length}
            onClick={() => activate(key, "next")}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15 5v10M6 5l6 5-6 5Z" /></svg>
          </button>
        </div>
      </div>
      <div
        className="case-stage"
        onPointerDown={() => {
          article.current.focus();
          activate(key, false);
        }}
        title="Focus to orbit; Play to animate"
      >
        {focused ? (
          <CasePlayer
            target={target}
            solution={solution}
            playSignal={active.playSignal}
            action={active.action}
            onPlaying={setPlaying}
            onFrameChange={setFrame}
            onStep={(next, partial = false) => { setStep(next); setTurning(partial); }}
            visible={visible}
          />
        ) : image ? (
          <img src={image} alt="Orbitable FTO case preview" draggable="false" />
        ) : (
          <span className="case-loading">{error || "Loading preview…"}</span>
        )}
      </div>
    </article>
  );
}
export default function CaseList({ visible }) {
  const [saved] = useState(() => readSession(CASE_SESSION_KEY));
  const [mode, setMode] = useState(CASE_MODES.some((m) => m.id === saved?.mode) ? saved.mode : "arrow"),
    [depth, setDepth] = useState([1, 2, 3, 4].includes(saved?.depth) ? saved.depth : 1),
    [page, setPage] = useState(Number.isInteger(saved?.page) && saved.page > 0 ? saved.page : 1),
    [manifest, setManifest] = useState(null),
    [cases, setCases] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [active, setActive] = useState({ key: "", playSignal: 0 });
  const pool = useMemo(() => new CaseSnapshots(), []),
    playCounter = useRef(0);
  useSession(CASE_SESSION_KEY, { mode, depth, page });
  useEffect(() => () => pool.dispose(), [pool]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}cases/manifest.json`, {
      cache: "no-cache",
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error("Could not load the case catalog");
        return r.json();
      })
      .then(setManifest)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setCases([]);
    setActive({ key: "", playSignal: 0 });
    fetch(`${import.meta.env.BASE_URL}cases/${mode}/${depth}.json`, {
      cache: "no-cache",
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error("Could not load cases");
        return r.json();
      })
      .then((data) => {
        if (
          !Array.isArray(data) ||
          data.some(
            (c) =>
              typeof c.id !== "string" ||
              typeof c.name !== "string" ||
              !Array.isArray(c.solutions) || !c.solutions.length ||
              c.solutions.some((solution) => typeof solution !== "string" ||
                parseScramble(solution).length !== depth),
          )
        )
          throw new Error("Invalid case file");
        setCases(data);
        setPage((old) => Math.min(old, Math.max(1, Math.ceil(data.length / 40))));
        setLoading(false);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [mode, depth]);
  const activate = (key, play) => {
    const signal = play ? ++playCounter.current : 0;
    setActive((old) =>
      old.key === key && !play ? old : { key, playSignal: signal, action: play === true ? "play" : play },
    );
  };
  const totalPages = Math.max(1, Math.ceil(cases.length / 40)),
    definition = manifest?.modes[mode],
    slice = cases.slice((page - 1) * 40, page * 40);
  function changePage(next) {
    setPage(next);
    setActive({ key: "", playSignal: 0 });
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  const pagination = (
    <nav className="case-pagination" aria-label="Case pages">
      <button
        type="button"
        disabled={page === 1}
        onClick={() => changePage(page - 1)}
      >
        Previous
      </button>
      <label>
        Page{" "}
        <select
          aria-label="Case page"
          value={page}
          onChange={(e) => changePage(+e.target.value)}
        >
          {Array.from({ length: totalPages }, (_, i) => (
            <option key={i} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>{" "}
        / {totalPages}
      </label>
      <button
        type="button"
        disabled={page === totalPages}
        onClick={() => changePage(page + 1)}
      >
        Next
      </button>
    </nav>
  );
  return (
    <main className="case-list" hidden={!visible}>
      <div className="case-toolbar">
        <label>
          Cases
          <select
            aria-label="Case type"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setPage(1);
            }}
          >
            {CASE_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Distance
          <select
            aria-label="Case distance"
            value={depth}
            onChange={(e) => {
              setDepth(+e.target.value);
              setPage(1);
            }}
          >
            {[1, 2, 3, 4].map((d) => (
              <option key={d} value={d}>
                {d} {d === 1 ? "move" : "moves"}
              </option>
            ))}
          </select>
        </label>
        <span className="case-count">
          {!loading && cases.length
            ? `${(page - 1) * 40 + 1}–${Math.min(page * 40, cases.length)} of ${cases.length}`
            : ""}
        </span>
        {pagination}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {loading && <p role="status">Loading cases…</p>}
      {definition && (
        <div className={definition.mirrors ? "case-pairs" : "case-center-grid"}>
          {slice.map((entry, i) => {
            const n = (page - 1) * 40 + i;
            const card = (mirrored) => (
              <CaseCard
                key={`${mode}:${depth}:${entry.id}:${mirrored}`}
                entry={entry}
                target={definition.target}
                mode={mode}
                revision={manifest.revision}
                index={n}
                mirrored={mirrored}
                active={active}
                activate={activate}
                pool={pool}
                visible={visible}
              />
            );
            return definition.mirrors ? (
              <div className="case-pair" key={`${mode}:${depth}:${entry.id}`}>
                {card(false)}
                {card(true)}
              </div>
            ) : (
              card(false)
            );
          })}
        </div>
      )}
      {!loading && cases.length > 0 && pagination}
    </main>
  );
}
