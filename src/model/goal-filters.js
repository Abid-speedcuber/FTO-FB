import { goalsFor, physicalGroups, solved, names, colorsAt, stickerPositions } from "./fto.js";
const pieces = physicalGroups();
const centers = new Set(pieces.filter((p) => p.length === 1).flat());
const edges = new Set(pieces.filter((p) => p.length === 2).flat());
const metadata = new WeakMap(), choices = new Map();
export const isPseudo = (mode) => mode === "pseudo-arrow" || mode === "pseudo-fc+1";

// Face IDs are used only to associate each triplet center with its neighboring
// edge color. The resulting IDs are relative color pairs, never absolute slots.
export function goalCategory(target, color, mode) {
  if (mode === "fc") return { slot: "", triplet: "", key: `${color}:center` };
  if (metadata.has(target)) return metadata.get(target);
  const centerSlots = new Set(target.firstCenter.map(([slot]) => slot));
  const triplet = target.triplet ?? target.plusOne.filter(([slot]) => !centerSlots.has(slot));
  const edgeByFace = new Map(target.firstCenter
    .filter(([slot, paint]) => edges.has(slot) && paint !== color)
    .map(([slot, paint]) => [Math.floor(slot / 9), paint]));
  const sides = triplet.filter(([slot]) => centers.has(slot))
    .map(([slot, paint]) => [edgeByFace.get(Math.floor(slot / 9)), paint])
    .sort((a, b) => a[0] - b[0]);
  if (sides.length !== 2 || sides.some(([edge]) => edge === undefined))
    throw new Error("Triplet is not adjacent to two first-center edges");
  const slot = sides.map(([edge]) => edge).join("-"),
    source = sides.map(([, paint]) => paint).join("-");
  const value = { slot, triplet: source, key: `${color}:${slot}:${source}` };
  metadata.set(target, value);
  return value;
}
export function filterOptions(color, mode) {
  const key = `${color}:${mode}`;
  if (choices.has(key)) return choices.get(key);
  if (mode === "fc") return { slots: [], triplets: [] };
  const pairs = [...new Set(goalsFor(color, "fc+1")
    .filter((goal) => goal.first.every(([slot, paint]) => solved[slot].color === paint))
    .map((goal) => goalCategory(goal, color, "fc+1").slot))].sort();
  const option = (id) => ({ id, colors: id.split("-").map(Number),
    label: id.split("-").map((paint) => names[Number(paint)]).join("–") });
  const value = {
    slots: isPseudo(mode) ? pairs.map(option) : [],
    triplets: pairs.flatMap((id) => {
      const normal = option(id);
      return isPseudo(mode) ? [normal, { ...option(id.split("-").reverse().join("-")), label: `${normal.label} flipped` }] : [normal];
    }),
  };
  choices.set(key, value); return value;
}
export function matchesFilter(target, color, mode, filters = {}) {
  if (mode === "fc") return true;
  const category = goalCategory(target, color, mode), filter = filters[color] ?? {};
  return (!isPseudo(mode) || !filter.slot || filter.slot === "any" || category.slot === filter.slot) &&
    (!filter.triplet || filter.triplet === "any" || category.triplet === filter.triplet);
}
export function categoryDepths(records, mode) {
  const depths = {};
  for (const record of records) for (const target of record.targets ?? [record.target]) {
    const key = goalCategory(target, record.color, mode).key;
    depths[key] = Math.min(depths[key] ?? Infinity, record.moves.length);
  }
  return depths;
}
export function mergeSolutions(records, incoming) {
  const out = [...records], indices = new Map(out.map((s, i) => [`${s.color}:${s.moves.join(",")}`, i]));
  for (const solution of incoming) {
    const key = `${solution.color}:${solution.moves.join(",")}`, index = indices.get(key);
    if (index === undefined) { indices.set(key, out.length); out.push(solution); }
    else {
      const old = out[index], targets = new Map([...(old.targets ?? [old.target]), ...(solution.targets ?? [solution.target])]
        .map((target) => [JSON.stringify(target.first), target]));
      out[index] = { ...old, targets: [...targets.values()] };
    }
  }
  return out;
}
export function filteredSolutions(records, mode, filters = {}) {
  const matched = records.flatMap((record) => {
    const target = (record.targets ?? [record.target]).find((target) => matchesFilter(target, record.color, mode, filters));
    return target ? [target === record.target ? record : { ...record, target }] : [];
  });
  const depth = Math.min(...matched.map((s) => s.moves.length));
  return matched.filter((s) => s.moves.length === depth);
}

// Upgrade sessions saved before all matching formations were recorded per path.
export function completeSolutionTargets(records, mode, scramble) {
  return records.map((record) => {
    if (record.targets?.length) return record;
    const paint = colorsAt(stickerPositions([...scramble, ...record.moves]));
    const targets = goalsFor(record.color, mode).filter((goal) => goal.first.every(([slot, color]) => paint[slot] === color));
    return { ...record, targets: targets.length ? targets : [record.target] };
  });
}
