import { prepare, solve } from "./model/search.js";
const cache = new Map();
self.onmessage = ({ data: { color, scramble } }) => {
  try {
    const start = performance.now();
    let tables = cache.get(color);
    if (!tables) {
      tables = prepare(color, (message) =>
        self.postMessage({ type: "preparing", message }),
      );
      cache.set(color, tables);
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
