import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_CIF_FRAME } from "./vendor/orientation.js";
import { formatAlgorithm } from "./view-notation.js";
import HoldInput from "./HoldInput.jsx";
import Viewer from "./Viewer.jsx";
import CaseList from "./CaseList.jsx";
import SolverFilters from "./SolverFilters.jsx";
import { filteredSolutions, mergeSolutions, categoryDepths, completeSolutionTargets } from "./model/goal-filters.js";
import Settings from "./Settings.jsx";
import { SOLVER_SESSION_KEY, SOLVER_MODES, readSession, packSolverSession, unpackSolverSession } from "./session.js";
import { useSession } from "./use-session.js";
import { FACES, names, parseScramble } from "./model/fto.js";
import "./style.css";

const queryKey = (mode, colors) => JSON.stringify([mode, [...colors].sort()]);
const scrambleKey = (scramble) => scramble.join(",");

function App() {
  const holdInput = useRef();
  const [frame, setFrame] = useState(DEFAULT_CIF_FRAME);
  const [viewRequest, setViewRequest] = useState(null);
  const [saved] = useState(() => unpackSolverSession(readSession(SOLVER_SESSION_KEY)));
  const [view, setView] = useState(saved?.view ?? "solver"),
    [casesOpened, setCasesOpened] = useState(saved?.view === "cases");
  const [text, setText] = useState(saved?.text ?? "");
  const [colors, setColors] = useState(saved?.colors ?? [0]),
    [mode, setMode] = useState(saved?.mode ?? "fb");
  const [active, setActive] = useState(saved?.active ?? {
    scramble: [],
    colors: [0],
    mode: "fb",
    setup: false,
  });
  const [filters, setFilters] = useState(saved?.filters ?? {});
  const [memory, setMemory] = useState(() => {
    const memory = saved?.memory ?? {
      scramble: saved?.active.scramble ?? [],
      queries: saved?.active.setup ? { [queryKey(saved.active.mode, saved.active.colors)]: {
        records: saved.solutions, depth: saved.status === "done" ? saved.progress.depth : -1,
        baseDepth: saved.status === "done" ? saved.progress.depth : null,
      } } : {},
    };
    return { ...memory, queries: Object.fromEntries(Object.entries(memory.queries).map(([key, entry]) =>
      [key, { ...entry, records: completeSolutionTargets(entry.records, JSON.parse(key)[0], memory.scramble) }])) };
  });
  const entry = memory.queries[queryKey(active.mode, active.colors)];
  const solutions = useMemo(() => filteredSolutions(entry?.records ?? [], active.mode, filters[active.mode]),
    [entry?.records, active.mode, filters]);
  const [selected, setSelected] = useState(saved?.selected ?? -1),
    [replay, setReplay] = useState(0);
  const [status, setStatus] = useState(saved?.status ?? "idle"),
    [message, setMessage] = useState(saved?.message ?? ""),
    [progress, setProgress] = useState(saved?.progress ?? {});
  const [page, setPage] = useState(saved?.page ?? 1),
    [copied, setCopied] = useState(false);
  const worker = useRef(),
    run = useRef(0);
  useEffect(() => () => worker.current?.terminate(), []);
  useSession(SOLVER_SESSION_KEY, {
    view, text, colors, mode, active, solutions, selected, status, message, progress, page, filters, memory,
  }, packSolverSession);
  const busy = status === "preparing" || status === "searching";
  function find(e) {
    e.preventDefault();
    if (!colors.length) {
      setMessage("Select at least one color.");
      return;
    }
    let scramble;
    try {
      scramble = parseScramble(text);
    } catch (error) {
      setMessage(error.message);
      return;
    }
    startSearch({ scramble, colors, mode }, false);
  }
  function startSearch(request, deeper) {
    const { scramble, colors, mode } = request,
      sameScramble = scrambleKey(scramble) === scrambleKey(memory.scramble),
      key = queryKey(mode, colors),
      cached = sameScramble ? memory.queries[key] : null,
      records = cached?.records ?? [];
    setActive({ scramble, colors, mode, setup: true });
    setSelected(-1);
    setPage(1);
    setMessage("");
    if (!sameScramble) setMemory({ scramble, queries: {} });
    if (!deeper && cached?.baseDepth != null) {
      setStatus("done"); setProgress({ depth: cached.depth }); return;
    }
    if (!worker.current) worker.current = new Worker(
      new URL("./solver.worker.js", import.meta.url), { type: "module" });
    const job = ++run.current;
    const update = (change) => setMemory((old) => ({
      ...old, queries: { ...old.queries,
        [key]: change(old.queries[key] ?? { records: [], depth: -1, baseDepth: null }),
      },
    }));
    setProgress({});
    setStatus("preparing");
    worker.current.onmessage = ({ data }) => {
      if (job !== run.current) return;
      if (data.type === "progress") { setStatus("searching"); setProgress(data); }
      if (data.type === "solutions") update((old) => ({ ...old, records: mergeSolutions(old.records, data.solutions) }));
      if (data.type === "depth") update((old) => ({ ...old, depth: Math.max(old.depth, data.depth),
        baseDepth: old.baseDepth ?? (old.records.length ? Math.min(...old.records.map((s) => s.moves.length)) : null),
      }));
      if (data.type === "done") { setStatus("done"); setProgress(data); }
      if (data.type === "error") { setStatus("error"); setMessage(data.message); }
    };
    worker.current.onerror = (error) => {
      if (job !== run.current) return;
      setStatus("error"); setMessage(error.message || "Solver failed. Try again.");
    };
    worker.current.postMessage({ scramble, colors, mode,
      filters: deeper ? filters[mode] ?? {} : {},
      minDepth: deeper ? (cached?.depth ?? -1) + 1 : 0,
      knownDepths: deeper ? categoryDepths(records, mode) : {},
    });
  }
  function changeFilter(color, field, value) {
    setFilters((old) => ({ ...old, [mode]: { ...old[mode], [color]: { ...old[mode]?.[color], [field]: value } } }));
    setSelected(-1); setPage(1);
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
              formatAlgorithm(s.moves, frame) ||
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
  const shownDepth = solutions[0]?.moves.length ?? entry?.depth ?? progress.depth;
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <img
            className="brand-logo"
            src={`${import.meta.env.BASE_URL}logo.svg`}
            alt=""
            aria-hidden="true"
            width="62"
            height="34"
          />
          <h1>
            First Block<small>by Abid Ibn Ashraf</small>
          </h1>
          <select
            className="app-view"
            aria-label="App view"
            value={view}
            onChange={(e) => {
              setView(e.target.value);
              if (e.target.value === "cases") setCasesOpened(true);
            }}
          >
            <option value="solver">Solver</option>
            <option value="cases">Case list</option>
          </select>
          <Settings />
        </div>
      </header>
      <main hidden={view !== "solver"}>
        <form onSubmit={find} className="solver-input">
          <label htmlFor="scramble">
            Scramble
          </label>
          <input
            type="text"
            id="scramble"
            autoComplete="off"
            autoCapitalize="off"
            onPaste={(e) => {
              const pasted = e.clipboardData.getData("text/plain");
              if (!/[\r\n\t]/.test(pasted)) return;
              e.preventDefault();
              const input = e.currentTarget,
                start = input.selectionStart ?? text.length,
                end = input.selectionEnd ?? text.length;
              const normalized = pasted.replace(/\s+/g, " ");
              setText(text.slice(0, start) + normalized + text.slice(end));
              requestAnimationFrame(() =>
                input.setSelectionRange(
                  start + normalized.length,
                  start + normalized.length,
                ),
              );
            }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
            spellCheck="false"
            placeholder="Scramble"
          />
          <div className="toolbar">
            <fieldset disabled={busy} aria-label="Block colors">
              <legend>
                {colors.length <= 2
                  ? colors.map((c) => names[c]).join(", ") || "Colors"
                  : `${colors.length} colors`}
              </legend>
              <div className="colors">
                {FACES.map((face, i) => (
                  <label
                    key={i}
                    className={`swatch ${colors.includes(i) ? "chosen" : ""}`}
                    style={{ "--color": face.color }}
                    title={names[i]}
                  >
                    <input
                      type="checkbox"
                      aria-label={names[i]}
                      checked={colors.includes(i)}
                      onChange={() =>
                        setColors((old) =>
                          old.includes(i)
                            ? old.filter((c) => c !== i)
                            : [...old, i].sort((a, b) => a - b),
                        )
                      }
                    />
                    <span aria-hidden="true">
                      {colors.includes(i) ? "✓" : ""}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="solver-options">
            <label className="mode-label">
              Mode
              <select
                aria-label="Mode"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                disabled={busy}
              >
                {SOLVER_MODES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <SolverFilters mode={mode} colors={colors} filters={filters[mode]} onChange={changeFilter} />
            </div>
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
            <div className="results-bar">
              <div className="results-summary">
              <span aria-live="polite">
              {status === "preparing" ? (
                <span>Preparing…</span>
              ) : status === "searching" ? (
                <span>
                  Depth {progress.depth ?? 0} · {solutions.length} found
                </span>
              ) : status === "done" ? (
                <span>
                  {shownDepth} {shownDepth === 1 ? "move" : "moves"} ·{" "}
                  {solutions.length}{" "}
                  {solutions.length === 1 ? "solution" : "solutions"}
                </span>
              ) : (
                <span />
              )}
              </span>
              <HoldInput ref={holdInput} frame={frame} onCommit={(hold) => setViewRequest({ frame: hold })} />
              </div>
              {solutions.length > 0 && (
                <button className="quiet" onClick={copy}>
                  {copied ? "Copied" : "Copy all"}
                </button>
              )}
            </div>
            {active.setup && <div className="active-scramble">
              <span>Scramble</span>
              <code>{formatAlgorithm(active.scramble) || "Solved state"}</code>
            </div>}
            {!busy && active.setup && !solutions.length && entry?.depth >= 0 && (
              <div className="deeper-prompt" role="status">
                <span>No matching solution through {entry.depth} {entry.depth === 1 ? "move" : "moves"}.</span>
                <button type="button" onClick={() => startSearch(active, true)}>Search deeper</button>
              </div>
            )}
            <div className="cards">
              {solutions
                .slice((page - 1) * 60, page * 60)
                .map((solution, i) => {
                  const n = (page - 1) * 60 + i;
                  const alg =
                    formatAlgorithm(solution.moves, frame) ||
                    "Already complete";
                  return (
                    <button
                      key={n}
                      className={`solution-card ${selected === n ? "selected" : ""}`}
                      aria-label={`Play ${names[solution.color]} solution ${n + 1}: ${alg}`}
                      onClick={() => {
                        setSelected(n);
                        setReplay((r) => r + 1);
                      }}
                    >
                      <span className="algorithm">{alg}</span>
                      <span className="card-meta">
                        <span
                          className="card-color"
                          style={{ "--color": FACES[solution.color].color }}
                          aria-hidden="true"
                        />
                        {names[solution.color]}
                        <span className="length">{solution.moves.length}</span>
                      </span>
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
            active={view === "solver"}
            onFrameChange={setFrame}
            onViewInteraction={(hold) => holdInput.current?.follow(hold)}
            viewRequest={viewRequest}
            scramble={active.scramble}
            colors={active.colors}
            mode={active.mode}
            setup={active.setup}
            solution={solutions[selected]}
            selectionKey={replay}
          />
        </section>
      </main>
      {casesOpened && <CaseList visible={view === "cases"} />}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
