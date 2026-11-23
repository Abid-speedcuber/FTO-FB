import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Viewer from "./Viewer.jsx";
import {
  FACES,
  names,
  moves,
  parseScramble,
  notationFaceAtSlot,
} from "./model/fto.js";
import "./style.css";
const example = "R U F' L BR U'";
function App() {
  const [text, setText] = useState(example),
    [color, setColor] = useState(0),
    [active, setActive] = useState({
      scramble: parseScramble(example),
      color: 0,
    }),
    [solutions, setSolutions] = useState([]),
    [selected, setSelected] = useState(-1),
    [replay, setReplay] = useState(0),
    [status, setStatus] = useState("idle"),
    [message, setMessage] = useState(""),
    [progress, setProgress] = useState({}),
    [page, setPage] = useState(1),
    [copied, setCopied] = useState(false);
  const worker = useRef(),
    run = useRef(0),
    started = useRef(),
    [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!["preparing", "searching"].includes(status)) return;
    const timer = setInterval(
      () => setElapsed((Date.now() - started.current) / 1000),
      200,
    );
    return () => clearInterval(timer);
  }, [status]);
  useEffect(() => () => worker.current?.terminate(), []);
  const busy = status === "preparing" || status === "searching";
  function find(e) {
    e?.preventDefault();
    let scramble;
    try {
      scramble = parseScramble(text);
    } catch (e) {
      setMessage(e.message);
      return;
    }
    if (!worker.current)
      worker.current = new Worker(
        new URL("./solver.worker.js", import.meta.url),
        { type: "module" },
      );
    const job = ++run.current;
    setActive({ scramble, color });
    setSolutions([]);
    setSelected(-1);
    setPage(1);
    setMessage("");
    setProgress({});
    setStatus("preparing");
    started.current = Date.now();
    setElapsed(0);
    worker.current.onmessage = ({ data }) => {
      if (job !== run.current) return;
      if (data.type === "preparing") setMessage(data.message);
      if (data.type === "progress") {
        setStatus("searching");
        setMessage("");
        setProgress(data);
      }
      if (data.type === "solutions")
        setSolutions((old) => [...old, ...data.solutions]);
      if (data.type === "done") {
        setStatus("done");
        setProgress(data);
        setElapsed(data.elapsed / 1000);
        setMessage("");
      }
      if (data.type === "error") {
        setStatus("error");
        setMessage(data.message);
      }
    };
    worker.current.onerror = (e) => {
      if (job !== run.current) return;
      setStatus("error");
      setMessage(e.message || "The solver could not start. Try again.");
    };
    worker.current.postMessage({ scramble, color });
  }
  function stop() {
    run.current++;
    worker.current?.terminate();
    worker.current = null;
    setStatus("stopped");
    setMessage("Search stopped. Optimal enumeration is incomplete.");
  }
  function random() {
    const seq = [];
    let last = -1;
    for (let i = 0; i < 30; i++) {
      let face;
      do {
        face = Math.floor(Math.random() * 8);
      } while (face === last);
      last = face;
      seq.push(moves[face * 2 + Math.floor(Math.random() * 2)].name);
    }
    setText(seq.join(" "));
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        solutions
          .map(
            (s) =>
              s.moves.map((m) => moves[m].name).join(" ") || "(already solved)",
          )
          .join("\n"),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setMessage("Clipboard unavailable. Select the move text to copy it.");
    }
  }
  const visible = solutions.slice((page - 1) * 60, page * 60),
    pages = Math.ceil(solutions.length / 60);
  return (
    <main>
      <header>
        <a className="brand" href="./">
          <span className="logo">◈</span>FTO
          <span className="brand-divider">/</span>
          <span>First block</span>
        </a>
        <span className="local-tag">OPTIMAL SOLVER</span>
      </header>
      <section className="intro">
        <div className="eyebrow accent">A BETTER BEGINNING</div>
        <h1>Find your first block.</h1>
        <p>One color. Twelve poses. Every shortest solution.</p>
      </section>
      <form className="input-panel" onSubmit={find}>
        <div className="input-label">
          <label htmlFor="scramble">Scramble</label>
          <button
            type="button"
            className="quiet"
            onClick={random}
            disabled={busy}
          >
            Generate scramble
          </button>
        </div>
        <textarea
          id="scramble"
          spellCheck="false"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste an FTO scramble…"
          disabled={busy}
        />
        <div className="input-bottom">
          <fieldset disabled={busy}>
            <legend>Block color · {names[color]}</legend>
            <div className="colors">
              {FACES.map((f, i) => (
                <button
                  type="button"
                  key={i}
                  className={`swatch ${color === i ? "chosen" : ""}`}
                  style={{ "--color": f.color }}
                  onClick={() => setColor(i)}
                  aria-label={names[i]}
                  aria-pressed={color === i}
                  title={names[i]}
                >
                  {color === i ? "✓" : ""}
                </button>
              ))}
            </div>
          </fieldset>
          {busy ? (
            <button
              type="button"
              key="stop"
              className="primary stop"
              onClick={stop}
            >
              Stop search
            </button>
          ) : (
            <button key="find" className="primary" type="submit">
              Find optimal solutions <span>⌕</span>
            </button>
          )}
        </div>
        <div className="notation">
          U R F L B D BR BL · Prime (') or 2 for inverse turns · One face turn =
          one move
        </div>
      </form>
      <section className="workspace">
        <div className="results">
          <div className="section-title">
            <h2>
              Solutions{" "}
              <span>
                {solutions.length ? solutions.length.toLocaleString() : ""}
              </span>
            </h2>
            {solutions.length > 0 && (
              <button className="quiet" onClick={copy}>
                {copied ? "Copied" : "Copy all"}
              </button>
            )}
          </div>
          {status === "idle" && (
            <div className="empty">
              <span className="empty-icon">◈</span>
              <h3>Great solves start here.</h3>
              <p>
                Choose your color and find the shortest path to a first block.
              </p>
              <div className="pill-row">
                <span>Any orbit face</span>
                <span>All optimal solutions</span>
              </div>
            </div>
          )}
          {busy && (
            <div className="search-status" role="status">
              <span className="spinner" />
              <div>
                <strong>
                  {status === "preparing"
                    ? "Preparing exact pruning tables"
                    : `Searching depth ${progress.depth ?? 0}`}
                </strong>
                <p>
                  {status === "preparing"
                    ? message
                    : `${(progress.nodes ?? 0).toLocaleString()} nodes explored · ${solutions.length.toLocaleString()} solutions found`}
                </p>
              </div>
              <span>{elapsed.toFixed(1)}s</span>
            </div>
          )}
          {message && !busy && (
            <p className={status === "error" ? "error" : "notice"} role="alert">
              {message}
            </p>
          )}
          {status === "done" && (
            <div className="complete">
              <span>✓</span>
              <p>
                <strong>
                  {progress.depth} {progress.depth === 1 ? "move" : "moves"} ·
                  Optimality proven
                </strong>
                <small>
                  All {progress.count.toLocaleString()} shortest solutions ·{" "}
                  {elapsed.toFixed(2)}s ·{" "}
                  {(progress.nodes ?? 0).toLocaleString()} nodes
                </small>
              </p>
            </div>
          )}
          <div className="cards">
            {visible.map((s, i) => {
              const n = (page - 1) * 60 + i;
              return (
                <button
                  className={`solution-card ${selected === n ? "selected" : ""}`}
                  key={n}
                  onClick={() => {
                    setSelected(n);
                    setReplay((v) => v + 1);
                  }}
                >
                  <span className="card-top">
                    <span>Solution {String(n + 1).padStart(2, "0")}</span>
                    <span>
                      {s.moves.length} {s.moves.length === 1 ? "move" : "moves"}
                    </span>
                  </span>
                  <span className="algorithm">
                    {s.moves.map((m) => moves[m].name).join(" ") ||
                      "Already complete"}
                  </span>
                  <span className="card-bottom">
                    <span>
                      {names[active.color]} block on{" "}
                      {notationFaceAtSlot(
                        s.target.first.find(([, c]) => c === active.color)[0],
                      )}
                    </span>
                    <span className="preview-label">
                      {selected === n ? "↻ Replay" : "▶ Preview"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {pages > 1 && (
            <nav className="pagination" aria-label="Solution pages">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 1}
              >
                Previous
              </button>
              <span>
                {page} / {pages}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page === pages}
              >
                Next
              </button>
            </nav>
          )}
        </div>
        <Viewer
          scramble={active.scramble}
          color={active.color}
          solution={solutions[selected]}
          selectionKey={replay}
        />
      </section>
      <footer>
        <span>18 pieces defined. The best 12 solved.</span>
        <details>
          <summary>How the search works</summary>
          <p>
            All 16 face turns have equal cost. Iterative deepening with exact,
            multi-source pattern databases searches all three choices of omitted
            triple in all 12 poses (four orbit faces × three orientations). A
            completed search enumerates every shortest move sequence, including
            commuting move orders. No solution limit is applied. The search runs
            on your device in a worker; stop it at any time.
          </p>
          <p>
            The viewer keeps all 18 candidate pieces defined; six may be outside
            the completed block. Geometry and block patterns are adapted from
            FTO-simulator (GPL-3.0).
          </p>
        </details>
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")).render(<App />);
