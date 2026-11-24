import { prepare, solveSelected } from "./model/search.js";
import { goalCategory, matchesFilter } from "./model/goal-filters.js";
import { loadTables, saveTables } from "./model/table-cache.js";
const cache = new Map();
self.onmessage = async ({ data: { colors, color, scramble, mode = "fb", filters = {}, minDepth = 0, knownDepths = {} } }) => {
  try {
    const start = performance.now();
    const selected = [
      ...new Set(colors ?? (color === undefined ? [] : [color])),
    ];
    if (!selected.length) throw new Error("Select at least one color.");
    if (selected.some((c) => !Number.isInteger(c) || c < 0 || c > 7))
      throw new Error("Invalid color selection.");
    const entries = [];
    for (const color of selected) {
      const key = `${color}:${mode}`;
      let tables = cache.get(key);
      if (!tables) {
        tables = await loadTables(color, mode);
        if (!tables) {
          tables = prepare(
            color,
            (message) => self.postMessage({ type: "preparing", message }),
            mode,
          );
          await saveTables(color, mode, tables);
        }
        cache.set(key, tables);
      }
      entries.push({ color, tables });
    }
    let pending = [];
    const flush = () => {
      if (pending.length) {
        self.postMessage({ type: "solutions", solutions: pending });
        pending = [];
      }
    };
    const resolved = { ...knownDepths };
    let discovered = {};
    const result = solveSelected(entries, scramble, {
      minDepth,
      acceptTarget: (target, color) => matchesFilter(target, color, mode, filters),
      includeTarget: (target, color, depth) => (resolved[goalCategory(target, color, mode).key] ?? Infinity) >= depth,
      onDepthComplete: (data) => {
        Object.assign(resolved, discovered);
        discovered = {};
        flush();
        self.postMessage({ type: "depth", ...data });
      },
      onProgress: (progress) => {
        flush();
        self.postMessage({ type: "progress", ...progress });
      },
      onSolution: (solution) => {
        for (const target of solution.targets) discovered[goalCategory(target, solution.color, mode).key] = solution.moves.length;
        pending.push(solution);
        if (pending.length >= 100) flush();
      },
    });
    flush();
    self.postMessage({
      type: "done",
      ...result,
      elapsed: performance.now() - start,
    });
  } catch (e) {
    self.postMessage({ type: "error", message: e.message });
  }
};
