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
  const indexTarget = (target) => {
    const key = JSON.stringify(target);
    if (!indices.has(key)) { indices.set(key, targets.length); targets.push(target); }
    return indices.get(key);
  };
  const pack = (solution) => {
    const row = [solution.moves, solution.color, indexTarget(solution.target)];
    if (solution.targets) row.push(solution.targets.map(indexTarget));
    return row;
  };
  const solutions = session.solutions.map(pack);
  const memory = session.memory ? { ...session.memory, queries: Object.fromEntries(
    Object.entries(session.memory.queries).map(([key, entry]) => [key, { ...entry, records: entry.records.map(pack) }]),
  ) } : undefined;
  return { ...session, solutions, ...(memory ? { memory } : {}), targets };
}
const validMoves = (path) => Array.isArray(path) && path.every((m) => Number.isInteger(m) && m >= 0 && m < 16);
const validColors = (colors) => Array.isArray(colors) && colors.every((c) => Number.isInteger(c) && c >= 0 && c < 8);
const validMode = (mode) => SOLVER_MODES.some(([id]) => mode === id);
export function unpackSolverSession(saved) {
  if (!saved || typeof saved.text !== "string" || !validColors(saved.colors) || !validMode(saved.mode) ||
      !saved.active || !validMoves(saved.active.scramble) || !validColors(saved.active.colors) ||
      !validMode(saved.active.mode) || !Array.isArray(saved.solutions) || !Array.isArray(saved.targets)) return null;
  const validTarget = (target) => target && Array.isArray(target.first) &&
    target.first.every((entry) => Array.isArray(entry) && entry.length === 2 &&
      Number.isInteger(entry[0]) && entry[0] >= 0 && entry[0] < 72 && validColors([entry[1]]));
  const unpack = (rows) => {
    if (!Array.isArray(rows)) throw new Error("Invalid saved solutions");
    return rows.map((row) => {
      if (!Array.isArray(row)) throw new Error("Invalid saved solution");
      const [path, color, targetIndex, targetIndices] = row, target = saved.targets[targetIndex];
      if (!validMoves(path) || !validColors([color]) || !validTarget(target)) throw new Error("Invalid saved goal");
      const solution = { moves: path, color, target };
      if (targetIndices) {
        if (!Array.isArray(targetIndices) || !targetIndices.length || !targetIndices.every((i) => validTarget(saved.targets[i])))
          throw new Error("Invalid saved goal alternatives");
        solution.targets = targetIndices.map((i) => saved.targets[i]);
      }
      return solution;
    });
  };
  let solutions, memory;
  try {
    solutions = unpack(saved.solutions);
    if (saved.memory) {
      if (!validMoves(saved.memory.scramble) || !saved.memory.queries || typeof saved.memory.queries !== "object") return null;
      memory = { ...saved.memory, queries: Object.fromEntries(Object.entries(saved.memory.queries)
        .map(([key, entry]) => {
          const query = JSON.parse(key);
          if (!Array.isArray(query) || !validMode(query[0]) || !validColors(query[1]) ||
              !Number.isInteger(entry.depth) || entry.depth < -1 ||
              (entry.baseDepth !== null && (!Number.isInteger(entry.baseDepth) || entry.baseDepth < 0)))
            throw new Error("Invalid saved search coverage");
          return [key, { ...entry, records: unpack(entry.records) }];
        })) };
    }
  } catch { return null; }
  const interrupted = saved.status === "preparing" || saved.status === "searching";
  return {
    ...saved, solutions, ...(memory ? { memory } : {}),
    view: ["cases", "trainer"].includes(saved.view) ? saved.view : "solver",
    selected: Number.isInteger(saved.selected) && saved.selected >= 0 && saved.selected < solutions.length ? saved.selected : -1,
    page: Math.max(1, Math.min(Number.isInteger(saved.page) ? saved.page : 1, Math.ceil(solutions.length / 60) || 1)),
    status: interrupted ? "stopped" : ["done", "stopped", "error"].includes(saved.status) ? saved.status : "idle",
    message: interrupted ? "Search interrupted by reload. Results are incomplete." : typeof saved.message === "string" ? saved.message : "",
    progress: saved.progress && typeof saved.progress === "object" ? saved.progress : {},
  };
}
