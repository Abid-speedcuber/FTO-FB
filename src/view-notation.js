import { FACES, moves, CIF_FACES } from "./model/fto.js";
import { DEFAULT_CIF_FRAME, FRAMES } from "./vendor/orientation.js";

const labels = new WeakMap();
const cifName = Object.fromEntries(Object.entries(CIF_FACES).map(([label, geometric]) => [geometric, label]));
// Invert the simulator's label -> geometric-normal mapping. Clockwise remains
// clockwise in both CIF and EIF: only the face names change with the hold.
export function moveNamesForFrame(frame = DEFAULT_CIF_FRAME) {
  if (!labels.has(frame)) labels.set(frame, moves.map((move) => {
    const face = frame.normals.findIndex((normal) => normal.every((v, i) => v === move.normal[i]));
    return FACES[face].name + (move.dir < 0 ? "'" : "");
  }));
  return labels.get(frame);
}
export function formatAlgorithm(algorithm, frame = DEFAULT_CIF_FRAME) {
  const names = moveNamesForFrame(frame);
  return algorithm.map((move) => names[move]).join(" ");
}

// Hold markers use the original CIF face names, matching scramble notation.
export function formatHold(frame = DEFAULT_CIF_FRAME) {
  return `{${cifName[frame.up]},${cifName[frame.front]}}`;
}
export function parseHold(text) {
  let value = text.trim().toUpperCase();
  if (value.startsWith("{") || value.endsWith("}")) {
    if (!value.startsWith("{") || !value.endsWith("}")) return null;
    value = value.slice(1, -1);
  }
  const parts = value.split(",").map((part) => part.trim());
  if (parts.length !== 2 || !parts.every((part) => Object.hasOwn(CIF_FACES, part))) return null;
  return FRAMES.find((frame) => frame.up === CIF_FACES[parts[0]] && frame.front === CIF_FACES[parts[1]]) ?? null;
}
