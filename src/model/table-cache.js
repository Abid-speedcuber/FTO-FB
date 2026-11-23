import { goalsFor, permutations } from "./fto.js";
import { dehydrateTables, rehydrateTables } from "./search.js";
export const TABLE_CACHE_DATABASE = "fto-solver-tables";
const FORMAT = "v1";
let connection;
function hash(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++)
    h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}
const graphScope = `${FORMAT}:${hash(JSON.stringify(permutations.map((p) => [...p])))}`;
export function tableCacheKey(color, mode) {
  const goals = goalsFor(color, mode).map((g) => [
    g.first,
    g.rotation,
    g.up,
    g.cornerSource,
    g.cornerSlot,
  ]);
  return `${graphScope}:${color}:${mode}:${hash(JSON.stringify(goals))}`;
}
function openDatabase() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!connection)
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(TABLE_CACHE_DATABASE, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore("graphs");
        db.createObjectStore("tables");
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Table storage is blocked"));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          connection = undefined;
        };
        resolve(db);
      };
    }).catch(() => {
      connection = undefined;
      return null;
    });
  return connection;
}
function requested(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function loadTables(color, mode) {
  try {
    const db = await openDatabase();
    if (!db) return null;
    const saved = await requested(
      db
        .transaction("tables")
        .objectStore("tables")
        .get(tableCacheKey(color, mode)),
    );
    if (!saved) return null;
    const tx = db.transaction("graphs");
    const graphs = await Promise.all(
      saved.graphIds.map((id) =>
        requested(tx.objectStore("graphs").get(`${graphScope}:${id}`)),
      ),
    );
    if (graphs.some((g) => !g)) return null;
    return rehydrateTables({ graphs, table: saved.table });
  } catch {
    return null;
  }
}
export async function saveTables(color, mode, tables) {
  try {
    const db = await openDatabase();
    if (!db) return false;
    const packet = dehydrateTables(tables);
    const read = db.transaction("graphs").objectStore("graphs");
    const existing = await Promise.all(
      packet.graphs.map((g) => requested(read.getKey(`${graphScope}:${g.id}`))),
    );
    const tx = db.transaction(["graphs", "tables"], "readwrite");
    const done = new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    packet.graphs.forEach((graph, i) => {
      if (existing[i] === undefined)
        tx.objectStore("graphs").put(graph, `${graphScope}:${graph.id}`);
    });
    tx.objectStore("tables").put(
      { graphIds: packet.graphs.map((g) => g.id), table: packet.table },
      tableCacheKey(color, mode),
    );
    return await done;
  } catch {
    return false;
  }
}
