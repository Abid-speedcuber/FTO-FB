import { prepare, solve } from "./model/search.js";
import { loadTables, saveTables } from "./model/table-cache.js";
const cache = new Map();
self.onmessage = async ({ data: { color, scramble, mode = "fb" } }) => {
  try {
    const start = performance.now();
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
    let pending = [];
    const flush = () => {
      if (pending.length) {
        self.postMessage({ type: "solutions", solutions: pending });
        pending = [];
      }
    };
    const result = solve(tables, scramble, {
      onProgress: (progress) => {
        flush();
        self.postMessage({ type: "progress", ...progress });
      },
      onSolution: (solution) => {
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
