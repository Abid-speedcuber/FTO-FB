import test from "node:test";
import assert from "node:assert/strict";
import {
  loadTables,
  saveTables,
  tableCacheKey,
} from "../src/model/table-cache.js";
test("cache identities distinguish colors, modes, and pseudo goals", () => {
  const keys = new Set();
  for (let color = 0; color < 8; color++)
    for (const mode of [
      "fb",
      "fc+1",
      "arrow",
      "fc",
      "pseudo-arrow",
      "pseudo-fc+1",
    ])
      keys.add(tableCacheKey(color, mode));
  assert.equal(keys.size, 48);
  assert.equal(
    tableCacheKey(0, "pseudo-arrow"),
    tableCacheKey(0, "pseudo-arrow"),
  );
});
test("lack of persistent browser storage does not prevent solving", async () => {
  assert.equal(await loadTables(0, "fc"), null);
  assert.equal(await saveTables(0, "fc", null), false);
});
