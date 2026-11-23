import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Viewer from "./Viewer.jsx";
import { FACES, names, moves, parseScramble } from "./model/fto.js";
import "./style.css";

function App() {
  const [text, setText] = useState("");
  const [color, setColor] = useState(0),
    [mode, setMode] = useState("fb");
  const [active, setActive] = useState({ scramble: [], color: 0, mode: "fb" });
  const [solutions, setSolutions] = useState([]),
    [selected, setSelected] = useState(-1),
    [replay, setReplay] = useState(0);
  const [status, setStatus] = useState("idle"),
    [message, setMessage] = useState(""),
    [progress, setProgress] = useState({});
  const [page, setPage] = useState(1),
    [copied, setCopied] = useState(false);
  const worker = useRef(),
    run = useRef(0);
  useEffect(() => () => worker.current?.terminate(), []);
  const busy = status === "preparing" || status === "searching";
  function find(e) {
    e.preventDefault();
    let scramble;
    try {
      scramble = parseScramble(text);
    } catch (error) {
      setMessage(error.message);
      return;
    }
    if (!worker.current)
      worker.current = new Worker(
        new URL("./solver.worker.js", import.meta.url),
        { type: "module" },
      );
    const job = ++run.current;
    setActive({ scramble, color, mode });
    setSolutions([]);
    setSelected(-1);
    setPage(1);
    setMessage("");
    setProgress({});
    setStatus("preparing");
    worker.current.onmessage = ({ data }) => {
      if (job !== run.current) return;
      if (data.type === "progress") {
        setStatus("searching");
        setProgress(data);
      }
      if (data.type === "solutions")
        setSolutions((old) => [...old, ...data.solutions]);
      if (data.type === "done") {
        setStatus("done");
        setProgress(data);
      }
      if (data.type === "error") {
        setStatus("error");
        setMessage(data.message);
      }
    };
    worker.current.onerror = (error) => {
      if (job !== run.current) return;
      setStatus("error");
      setMessage(error.message || "Solver failed. Try again.");
    };
    worker.current.postMessage({ scramble, color, mode });
  }
  function stop() {
    run.current++;
    worker.current?.terminate();
    worker.current = null;
    setStatus("stopped");
    setMessage("Stopped. Results are incomplete.");
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        solutions
          .map(
            (s) =>
              s.moves.map((m) => moves[m].name).join(" ") ||
              "(already complete)",
          )
          .join("\n"),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setMessage("Clipboard unavailable.");
    }
  }
  const pages = Math.ceil(solutions.length / 60);
  return (
    <main>
      <form onSubmit={find} className="solver-input">
        <label htmlFor="scramble">
          Scramble <small>CIF</small>
        </label>
        <textarea
          id="scramble"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          spellCheck="false"
          placeholder="Scramble"
        />
        <div className="toolbar">
          <fieldset disabled={busy} aria-label="Block color">
            <legend>{names[color]}</legend>
            <div className="colors">
              {FACES.map((face, i) => (
                <button
                  type="button"
                  key={i}
                  className={`swatch ${color === i ? "chosen" : ""}`}
                  style={{ "--color": face.color }}
                  aria-label={names[i]}
                  aria-pressed={color === i}
                  title={names[i]}
                  onClick={() => setColor(i)}
                >
                  {color === i ? "✓" : ""}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="mode-label">
            Mode
            <select
              aria-label="Mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              disabled={busy}
            >
              <option value="fb">FB</option>
              <option value="fc+1">FC+1</option>
              <option value="arrow">Arrow</option>
              <option value="pseudo-arrow">Pseudo Arrow</option>
              <option value="pseudo-fc+1">Pseudo FC+1</option>
              <option value="fc">First center</option>
            </select>
          </label>
          {busy ? (
            <button
              type="button"
              key="stop"
              className="solve stop"
              onClick={stop}
            >
              Stop
            </button>
          ) : (
            <button key="find" className="solve" type="submit">
              Solve
            </button>
          )}
        </div>
      </form>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      <section className="workspace">
        <div className="results">
          <div className="results-bar" aria-live="polite">
            {status === "preparing" ? (
              <span>Preparing…</span>
            ) : status === "searching" ? (
              <span>
                Depth {progress.depth ?? 0} · {solutions.length} found
              </span>
            ) : status === "done" ? (
              <span>
                {progress.depth} {progress.depth === 1 ? "move" : "moves"} ·{" "}
                {solutions.length}{" "}
                {solutions.length === 1 ? "solution" : "solutions"}
              </span>
            ) : (
              <span />
            )}
            {solutions.length > 0 && (
              <button className="quiet" onClick={copy}>
                {copied ? "Copied" : "Copy all"}
              </button>
            )}
          </div>
          <div className="cards">
            {solutions.slice((page - 1) * 60, page * 60).map((solution, i) => {
              const n = (page - 1) * 60 + i;
              const alg =
                solution.moves.map((m) => moves[m].name).join(" ") ||
                "Already complete";
              return (
                <button
                  key={n}
                  className={`solution-card ${selected === n ? "selected" : ""}`}
                  aria-label={`Play solution ${n + 1}: ${alg}`}
                  onClick={() => {
                    setSelected(n);
                    setReplay((r) => r + 1);
                  }}
                >
                  <span className="algorithm">{alg}</span>
                  <span className="length">{solution.moves.length}</span>
                </button>
              );
            })}
          </div>
          {pages > 1 && (
            <nav className="pagination" aria-label="Solution pages">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span>
                {page} / {pages}
              </span>
              <button
                disabled={page === pages}
                onClick={() => setPage((p) => p + 1)}
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
    </main>
  );
}
createRoot(document.getElementById("root")).render(<App />);
