import React, { useEffect, useMemo, useRef, useState } from "react";
import { PuzzleViewer } from "./vendor/puzzle-viewer.js";
import { moves, parseScramble } from "./model/fto.js";
import {
  CASE_MODES,
  caseFrames,
  mirrorAlgorithm,
  algorithmText,
  partialTarget,
  partialKey,
  applyPartial,
  inverseAlgorithm,
} from "./model/cases.js";
import { CaseSnapshots, CASE_CAMERA_RADIUS } from "./case-snapshots.js";

function CasePlayer({ target, solution, playSignal, onPlaying, visible }) {
  const host = useRef(),
    viewer = useRef(),
    raf = useRef(),
    index = useRef(0),
    playing = useRef(false);
  const parts = useMemo(() => caseFrames(target, solution), [target, solution]);
  function pause() {
    cancelAnimationFrame(raf.current);
    playing.current = false;
    onPlaying(false);
  }
  function play() {
    if (!viewer.current || !solution.length) return;
    pause();
    if (index.current >= solution.length) index.current = 0;
    playing.current = true;
    onPlaying(true);
    let start;
    function tick(time) {
      if (!playing.current) return;
      if (start === undefined) start = time;
      const p = Math.max(0, Math.min(1, (time - start) / 450)),
        i = index.current;
      viewer.current.setPuzzle(3, parts.frames[i], parts.mask, [
        { move: moves[solution[i]], progress: p },
      ]);
      if (p === 1) {
        index.current++;
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
    try {
      viewer.current = new PuzzleViewer(host.current);
      viewer.current.resize();
      viewer.current.setFrame(3, parts.frames[0], parts.mask, [], {
        ...viewer.current.view(),
        radius: CASE_CAMERA_RADIUS,
      });
    } catch (error) {
      host.current.textContent = "3D preview unavailable";
    }
    return () => {
      pause();
      viewer.current?.dispose();
      viewer.current = null;
    };
  }, [parts]);
  useEffect(() => {
    if (playSignal) {
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
    [playing, setPlaying] = useState(false);
  const solution = useMemo(() => {
    const algorithm = parseScramble(entry.solution);
    return mirrored ? mirrorAlgorithm(algorithm) : algorithm;
  }, [entry.solution, mirrored]);
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
        <div className="case-algorithm">{algorithmText(solution)}</div>
        <button
          type="button"
          className="case-play"
          onClick={() => activate(key, true)}
        >
          {focused && playing ? "Pause" : "Play"}
        </button>
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
            onPlaying={setPlaying}
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
  const [mode, setMode] = useState("arrow"),
    [depth, setDepth] = useState(1),
    [page, setPage] = useState(1),
    [manifest, setManifest] = useState(null),
    [cases, setCases] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [active, setActive] = useState({ key: "", playSignal: 0 });
  const pool = useMemo(() => new CaseSnapshots(), []),
    playCounter = useRef(0);
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
              typeof c.solution !== "string" ||
              parseScramble(c.solution).length !== depth,
          )
        )
          throw new Error("Invalid case file");
        setCases(data);
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
      old.key === key && !play ? old : { key, playSignal: signal },
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
