export const SOLVER_SESSION_KEY = "fto-solver-session";
export const VIEWER_SESSION_KEY = "fto-solver-viewer";
export const CASE_SESSION_KEY = "fto-case-preferences";
export const SOLVER_MODES = [
  ["pseudo-arrow", "Pseudo arrow Block"],
  ["fc", "First center"],
  ["arrow", "Arrow block"],
  ["pseudo-fc+1", "Pseudo FC+1"],
  ["fc+1", "FC+1"],
  ["fb", "FB"],
];
export function readSession(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    return saved?.version === 1 ? saved.data : null;
  } catch { return null; }
}
export function writeSession(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ version: 1, data })); }
  catch { /* Keep the app usable if storage is unavailable or full. */ }
}
// Deduplicate goal descriptions so even long result lists fit in browser storage.
export function packSolverSession(session) {
  const targets = [], indices = new Map();
  const solutions = session.solutions.map((solution) => {
    const key = JSON.stringify(solution.target);
    if (!indices.has(key)) { indices.set(key, targets.length); targets.push(solution.target); }
    return [solution.moves, solution.color, indices.get(key)];
  });
  return { ...session, solutions, targets };
}
const validMoves = (path) => Array.isArray(path) && path.every((m) => Number.isInteger(m) && m >= 0 && m < 16);
const validColors = (colors) => Array.isArray(colors) && colors.every((c) => Number.isInteger(c) && c >= 0 && c < 8);
const validMode = (mode) => SOLVER_MODES.some(([id]) => mode === id);
export function unpackSolverSession(saved) {
  if (!saved || typeof saved.text !== "string" || !validColors(saved.colors) || !validMode(saved.mode) ||
      !saved.active || !validMoves(saved.active.scramble) || !validColors(saved.active.colors) ||
      !validMode(saved.active.mode) || !Array.isArray(saved.solutions) || !Array.isArray(saved.targets)) return null;
  const solutions = [];
  for (const row of saved.solutions) {
    if (!Array.isArray(row)) return null;
    const [path, color, targetIndex] = row, target = saved.targets[targetIndex];
    if (!validMoves(path) || !validColors([color]) || !target || !Array.isArray(target.first) ||
        !target.first.every((entry) => Array.isArray(entry) && entry.length === 2 &&
          Number.isInteger(entry[0]) && entry[0] >= 0 && entry[0] < 72 && validColors([entry[1]]))) return null;
    solutions.push({ moves: path, color, target });
  }
  const interrupted = saved.status === "preparing" || saved.status === "searching";
  return {
    ...saved, solutions,
    view: saved.view === "cases" ? "cases" : "solver",
    selected: Number.isInteger(saved.selected) && saved.selected >= 0 && saved.selected < solutions.length ? saved.selected : -1,
    page: Math.max(1, Math.min(Number.isInteger(saved.page) ? saved.page : 1, Math.ceil(solutions.length / 60) || 1)),
    status: interrupted ? "stopped" : ["done", "stopped", "error"].includes(saved.status) ? saved.status : "idle",
    message: interrupted ? "Search interrupted by reload. Results are incomplete." : typeof saved.message === "string" ? saved.message : "",
    progress: saved.progress && typeof saved.progress === "object" ? saved.progress : {},
  };
}
