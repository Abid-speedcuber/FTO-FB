import {
  solved,
  orbits,
  physicalGroups,
  permutations,
  goalsFor,
  stickerPositions,
} from "./fto.js";
import { builtinPatterns } from "./solve-phases.js";

// Exact abstraction graphs. Each edge is one face turn; multi-source BFS distances
// are admissible even when the different projections prefer different goal poses.
function automaton(orbit, ids, mode = "positions") {
  const local = new Map(orbit.map((s, i) => [s, i]));
  const turns = permutations.map((p) => orbit.map((s) => local.get(p[s])));
  let encode, step, decode;
  if (mode === "colors") {
    const palette = [...new Set(orbit.map((s) => solved[s].color))];
    encode = (values) => values.reduce((v, c, i) => v | (c << (i * 2)), 0);
    decode = (code) => orbit.map((_, i) => (code >>> (2 * i)) & 3);
    step = (code, p) => {
      let out = 0;
      for (let i = 0; i < 12; i++)
        out |= ((code >>> (i * 2)) & 3) << (p[i] * 2);
      return out;
    };
    ids = orbit.map((s) => palette.indexOf(solved[s].color));
    var paletteResult = palette;
  } else {
    encode = (values) => {
      if (mode === "set") values = [...values].sort((a, b) => a - b);
      return values.reduce((v, p, i) => v + p * 12 ** i, 0);
    };
    decode = (code) => ids.map((_, i) => Math.floor(code / 12 ** i) % 12);
    step = (code, p) => encode(decode(code).map((s) => p[s]));
    ids = ids.map((s) => local.get(s));
  }
  const codes = [encode(ids)],
    index = new Map([[codes[0], 0]]);
  const capacity = mode === "colors" ? 369600 : 12 ** ids.length;
  const rows = new Uint32Array(capacity * 16);
  for (let i = 0; i < codes.length; i++) {
    for (let m = 0; m < 16; m++) {
      const next = step(codes[i], turns[m]);
      let n = index.get(next);
      if (n === undefined) {
        n = codes.length;
        index.set(next, n);
        codes.push(next);
      }
      rows[i * 16 + m] = n;
    }
  }
  const transitions = rows.subarray(0, codes.length * 16);
  return {
    orbit,
    local,
    kind: mode,
    count: ids.length,
    encode,
    decode,
    codes,
    index,
    transitions,
    size: codes.length,
    palette: paletteResult,
  };
}
function distances(a, b, seeds) {
  const size = a.size * (b?.size ?? 1),
    d = new Uint8Array(size);
  d.fill(255);
  const queue = new Uint32Array(size);
  let end = 0;
  for (const seed of seeds)
    if (d[seed] === 255) {
      d[seed] = 0;
      queue[end++] = seed;
    }
  for (let start = 0; start < end; start++) {
    const state = queue[start],
      ai = b ? Math.floor(state / b.size) : state,
      bi = b ? state % b.size : 0,
      depth = d[state] + 1;
    for (let m = 0; m < 16; m++) {
      const next = b
        ? a.transitions[ai * 16 + m] * b.size + b.transitions[bi * 16 + m]
        : a.transitions[ai * 16 + m];
      if (d[next] === 255) {
        d[next] = depth;
        queue[end++] = next;
      }
    }
  }
  return d;
}
const graphCache = new Map();
export function prepare(color, progress = () => {}, mode = "fb") {
  const groups = physicalGroups(),
    centers = new Set(groups.filter((g) => g.length === 1).flat());
  const centerOrbits = orbits.filter((o) => centers.has(o[0]));
  const faceOrbit = centerOrbits.find((o) =>
    o.some((s) => solved[s].color === color),
  );
  const otherOrbit = centerOrbits.find((o) => o !== faceOrbit);
  const edgeOrbit = orbits.find((o) =>
    groups.some((g) => g.length === 2 && g.includes(o[0])),
  );
  const cornerOrbit = orbits.find((o) =>
    groups.some((g) => g.length === 4 && g.includes(o[0])),
  );
  const all = goalsFor(color, mode),
    { g } = builtinPatterns();
  const pseudo = mode === "pseudo-arrow" || mode === "pseudo-fc+1";
  const referenceMode =
    mode === "pseudo-arrow" ? "arrow" : mode === "pseudo-fc+1" ? "fc+1" : mode;
  const referenceBases = goalsFor(color, referenceMode).filter((v) =>
    v.first.every(([id, c]) => solved[id].color === c),
  );
  const bases = pseudo
    ? [...new Map(all.map((v) => [v.cornerSource, v])).values()]
    : referenceBases;
  const required = referenceBases.map(
    (v) => new Set(v.first.map(([id]) => id)),
  );
  const edgeIds = groups
    .filter(
      (p) =>
        p.length === 2 && p.some((s) => required.some((set) => set.has(s))),
    )
    .map((p) => p.find((s) => edgeOrbit.includes(s)));
  const cornerIds = pseudo
    ? bases.map((v) => [v.cornerSource])
    : required.map((set) =>
        groups
          .filter((p) => p.length === 4 && p.some((s) => set.has(s)))
          .map((p) => p.find((s) => cornerOrbit.includes(s))),
      );
  const faceIds = faceOrbit.filter((s) => solved[s].color === color);
  function graph(key, orbit, ids, mode) {
    if (!graphCache.has(key))
      graphCache.set(key, { ...automaton(orbit, ids, mode), id: key });
    return graphCache.get(key);
  }
  progress("Building exact projection graphs");
  const edge = graph(`e${edgeIds}`, edgeOrbit, edgeIds),
    face = graph(`f${color}`, faceOrbit, faceIds, "set");
  const hasOtherCenters = referenceBases.some((base) =>
    base.first.some(([s]) => centers.has(s) && otherOrbit.includes(s)),
  );
  const center = hasOtherCenters
    ? graph(`center${otherOrbit[0]}`, otherOrbit, null, "colors")
    : graph(`empty${otherOrbit[0]}`, otherOrbit, []);
  const edgePositions = edge.codes.map((code) => edge.decode(code));
  const facePositions = face.codes.map((code) => new Set(face.decode(code)));
  const corners = cornerIds.map((ids) => graph(`c${ids}`, cornerOrbit, ids));
  const coordinate = (a, ids, r) => {
    const ps = ids.map((id) => a.local.get(g.permutations[r][id]));
    return ps.some((p) => p === undefined)
      ? undefined
      : a.index.get(a.encode(ps));
  };
  const options = bases.map((base, i) => {
    const targets = all
      .filter((v) =>
        pseudo ? v.cornerSource === base.cornerSource : v.up === base.up,
      )
      .flatMap((v) => {
        const c = pseudo
          ? corners[i].index.get(
              corners[i].encode([corners[i].local.get(v.cornerSlot)]),
            )
          : coordinate(corners[i], cornerIds[i], v.rotation);
        if (pseudo && !corners[i].local.has(v.cornerSlot)) return [];
        const shapeSlots = new Set(
          (v.shapeFirst ?? v.first).map(([slot]) => slot),
        );
        const requiredEdges = edgeIds.flatMap((id, k) =>
          shapeSlots.has(g.permutations[v.rotation][id])
            ? [[k, edge.local.get(g.permutations[v.rotation][id])]]
            : [],
        );
        const requiredFace = v.first
          .filter(([s, colorAtSlot]) => centers.has(s) && colorAtSlot === color)
          .map(([s]) => face.local.get(s));
        if (
          c === undefined ||
          requiredEdges.some(([, p]) => p === undefined) ||
          requiredFace.some((p) => p === undefined)
        )
          return [];
        const es = new Set(
          edgePositions.flatMap((positions, s) =>
            requiredEdges.every(([k, p]) => positions[k] === p) ? [s] : [],
          ),
        );
        const fs = new Set(
          facePositions.flatMap((positions, s) =>
            requiredFace.every((p) => positions.has(p)) ? [s] : [],
          ),
        );
        if (!es.size || !fs.size) return [];
        const constraints = v.first
          .filter(([s]) => centers.has(s) && otherOrbit.includes(s))
          .map(([s, c]) => [center.local.get(s), center.palette.indexOf(c)]);
        // A rigid rotation into the opposite sticker orbit cannot be reached by face turns.
        if (
          v.first.some(
            ([s, c]) =>
              centers.has(s) &&
              otherOrbit.includes(s) &&
              !center.palette.includes(c),
          )
        )
          return [];
        return [{ es, fs, c, constraints, variant: v }];
      });
    progress(`Building block ${i + 1} of ${bases.length} pruning tables`);
    const centerSeeds = [];
    for (let s = 0; s < center.size; s++) {
      const code = center.codes[s];
      if (
        targets.some((t) =>
          t.constraints.every(([p, c]) => ((code >>> (2 * p)) & 3) === c),
        )
      )
        centerSeeds.push(s);
    }
    return {
      targets,
      corner: corners[i],
      dc: distances(center, null, centerSeeds),
      dec: distances(
        edge,
        corners[i],
        targets.flatMap((t) => [...t.es].map((e) => e * corners[i].size + t.c)),
      ),
    };
  });
  const def = distances(
    edge,
    face,
    options.flatMap((o) =>
      o.targets.flatMap((t) =>
        [...t.es].flatMap((e) => [...t.fs].map((f) => e * face.size + f)),
      ),
    ),
  );
  return {
    edge,
    face,
    center,
    corners,
    options,
    def,
    edgeIds,
    faceIds,
    cornerIds,
  };
}
export function initialCoordinates(t, scramble) {
  const ps = stickerPositions(scramble);
  const positional = (a, ids) =>
    a.index.get(a.encode(ids.map((id) => a.local.get(ps[id]))));
  const colors = new Array(12);
  if (t.center.palette)
    for (const id of t.center.orbit)
      colors[t.center.local.get(ps[id])] = t.center.palette.indexOf(
        solved[id].color,
      );
  return [
    positional(t.edge, t.edgeIds),
    positional(t.face, t.faceIds),
    t.center.palette ? t.center.index.get(t.center.encode(colors)) : 0,
    ...t.corners.map((c, i) => positional(c, t.cornerIds[i])),
  ];
}
export function lowerBound(t, s) {
  const ef = t.def[s[0] * t.face.size + s[1]];
  let best = 255;
  for (let i = 0; i < t.options.length; i++) {
    const o = t.options[i];
    if (!o.targets.length) continue;
    best = Math.min(
      best,
      Math.max(ef, o.dc[s[2]], o.dec[s[0] * o.corner.size + s[3 + i]]),
    );
  }
  return best;
}
function searchProjections(
  { start, graphs, bound, goal },
  {
    onProgress = () => {},
    onSolution = () => {},
    maxNodes = Infinity,
    minDepth = 0,
    maxDepth = Infinity,
    firstSolution = false,
  } = {},
) {
  let nodes = 0,
    count = 0;
  const path = [],
    frames = Array.from({ length: 128 }, () => new Uint32Array(graphs.length));
  function visit(s, remaining, last, level) {
    nodes++;
    if (nodes > maxNodes) throw new Error("Search node limit reached");
    if ((nodes & 262143) === 0) onProgress({ depth, nodes, count });
    if (bound(s) > remaining) return;
    if (!remaining) {
      const targets = goal(s);
      if (targets.length) {
        count++;
        onSolution({ moves: [...path], target: targets[0], targets });
      }
      return;
    }
    for (let m = 0; m < 16; m++) {
      if (m >> 1 === last) continue;
      const next =
        frames[level] ?? (frames[level] = new Uint32Array(graphs.length));
      for (let i = 0; i < graphs.length; i++)
        next[i] = graphs[i].transitions[s[i] * 16 + m];
      path.push(m);
      visit(next, remaining - 1, m >> 1, level + 1);
      path.pop();
      if (firstSolution && count) return;
    }
  }
  let depth = Math.max(minDepth, bound(start));
  for (; depth <= maxDepth; depth++) {
    onProgress({ depth, nodes, count });
    visit(start, depth, -1, 0);
    if (count) return { depth, nodes, count };
  }
  return { depth: null, nodes, count: 0 };
}

export function solve(t, scramble, options = {}) {
  function goal(s) {
    const targets = [];
    for (let i = 0; i < t.options.length; i++)
      for (const target of t.options[i].targets)
        if (
          target.es.has(s[0]) &&
          target.fs.has(s[1]) &&
          target.c === s[3 + i] &&
          target.constraints.every(
            ([p, c]) => ((t.center.codes[s[2]] >>> (p * 2)) & 3) === c,
          )
        )
          targets.push(target.variant);
    return targets;
  }
  return searchProjections({ start: initialCoordinates(t, scramble),
    graphs: [t.edge, t.face, t.center, ...t.corners], bound: (s) => lowerBound(t, s), goal }, options);
}

// Search the union of all selected-color goals at a common depth. No color is
// searched to a longer individual optimum, and ties retain their own target.
export function solveSelected(
  entries,
  scramble,
  {
    onProgress = () => {}, onSolution = () => {}, onDepthComplete = () => {},
    acceptTarget = () => true, includeTarget = () => true,
    minDepth = 0, maxDepth = Infinity, maxNodes = Infinity,
  } = {},
) {
  const selected = [
    ...new Map(entries.map((entry) => [entry.color, entry])).values(),
  ];
  if (!selected.length) throw new Error("Select at least one color.");
  const choices = selected.map((entry) => ({
    ...entry,
    bound: lowerBound(entry.tables, initialCoordinates(entry.tables, scramble)),
  }));
  let nodes = 0;
  for (let depth = Math.max(minDepth, Math.min(...choices.map((c) => c.bound))); depth <= maxDepth; depth++) {
    let count = 0;
    for (const choice of choices) {
      if (choice.bound > depth) continue;
      // Cached broad PDBs stay admissible for these narrower goal sets. Preserve
      // option indices, since each one has its own corner coordinate.
      const tables = { ...choice.tables, options: choice.tables.options.map((option) => ({
        ...option, targets: option.targets.filter((target) => includeTarget(target.variant, choice.color, depth)),
      })) };
      if (!tables.options.some((option) => option.targets.length)) continue;
      const result = solve(tables, scramble, {
        minDepth: depth, maxDepth: depth, maxNodes: maxNodes - nodes,
        onProgress: (progress) => onProgress({ depth, nodes: nodes + progress.nodes, count, color: choice.color }),
        onSolution: (solution) => {
          if (solution.targets.some((target) => acceptTarget(target, choice.color))) count++;
          onSolution({ ...solution, color: choice.color });
        },
      });
      nodes += result.nodes;
    }
    onDepthComplete({ depth, nodes, count });
    if (count) return { depth, nodes, count };
  }
  return { depth: null, nodes, count: 0 };
}

// Functions are reconstructed after IndexedDB structured-clones the graph data.
export function dehydrateTables(tables) {
  const graphs = new Map();
  const pack = (graph) => {
    if (!graphs.has(graph.id)) {
      const { encode, decode, ...data } = graph;
      graphs.set(graph.id, data);
    }
    return graph.id;
  };
  const table = {
    ...tables,
    edge: pack(tables.edge),
    face: pack(tables.face),
    center: pack(tables.center),
    corners: tables.corners.map(pack),
    options: tables.options.map((o) => ({ ...o, corner: pack(o.corner) })),
  };
  return { graphs: [...graphs.values()], table };
}
export function rehydrateTables({ graphs, table }) {
  const loaded = new Map(
    graphs.map((data) => {
      if (graphCache.has(data.id)) return [data.id, graphCache.get(data.id)];
      const graph = {
        ...data,
        encode(values) {
          if (data.kind === "colors")
            return values.reduce((v, c, i) => v | (c << (2 * i)), 0);
          if (data.kind === "set") values = [...values].sort((a, b) => a - b);
          return values.reduce((v, p, i) => v + p * 12 ** i, 0);
        },
        decode(code) {
          return Array.from({ length: data.count }, (_, i) =>
            data.kind === "colors"
              ? (code >>> (2 * i)) & 3
              : Math.floor(code / 12 ** i) % 12,
          );
        },
      };
      graphCache.set(data.id, graph);
      return [data.id, graph];
    }),
  );
  const unpack = (id) => {
    if (!loaded.has(id)) throw new Error("Incomplete saved tables");
    return loaded.get(id);
  };
  return {
    ...table,
    edge: unpack(table.edge),
    face: unpack(table.face),
    center: unpack(table.center),
    corners: table.corners.map(unpack),
    options: table.options.map((o) => ({ ...o, corner: unpack(o.corner) })),
  };
}


// Trainer uses the same projection-distance tables and IDA search as Solver,
// with absent pieces left absent instead of filling them with solved stickers.
function partialCode(state, orbit) {
  return orbit.reduce((code, slot) => code * 9 + state[slot], 0);
}
export function preparePartial(target, goals, progress = () => {}) {
  const seed = new Uint8Array(72);
  for (const [slot, color] of target) seed[slot] = color + 1;
  const graphs = orbits.filter((orbit) => orbit.some((slot) => seed[slot])).map((orbit) => {
    const local = new Map(orbit.map((slot, i) => [slot, i]));
    const turns = permutations.map((p) => orbit.map((slot) => local.get(p[slot])));
    const encode = (values) => values.reduce((code, value) => code * 9 + value, 0);
    const states = [Uint8Array.from(orbit, (slot) => seed[slot])], codes = [encode(states[0])];
    const index = new Map([[codes[0], 0]]), rows = [];
    for (let i = 0; i < states.length; i++) {
      const row = [];
      for (const turn of turns) {
        const next = new Uint8Array(orbit.length);
        states[i].forEach((value, k) => { next[turn[k]] = value; });
        const code = encode(next);
        if (!index.has(code)) { index.set(code, states.length); states.push(next); codes.push(code); }
        row.push(index.get(code));
      }
      rows.push(...row);
    }
    return { orbit, index, size: states.length, transitions: Uint32Array.from(rows) };
  });
  const coordinates = (state) => graphs.map((graph) => graph.index.get(partialCode(state, graph.orbit)));
  const targets = goals.map((target) => {
    const state = new Uint8Array(72);
    for (const [slot, color] of target) state[slot] = color + 1;
    return { target, coordinates: coordinates(state) };
  }).filter((entry) => entry.coordinates.every((c) => c !== undefined));
  const completed = new Map(targets.map((entry) => [entry.coordinates.join(','), entry.target]));
  const pruning = [];
  for (let i = 0; i < graphs.length; i++) {
    pruning.push({ i, j: null, distance: distances(graphs[i], null, targets.map((t) => t.coordinates[i])) });
    for (let j = i + 1; j < graphs.length; j++) {
      progress('Preparing training solver');
      pruning.push({ i, j, distance: distances(graphs[i], graphs[j], targets.map((t) => t.coordinates[i] * graphs[j].size + t.coordinates[j])) });
    }
  }
  return { graphs, coordinates, completed, pruning };
}
export function solvePartial(tables, state, options = {}) {
  const { graphs, coordinates, completed, pruning } = tables;
  const start = coordinates(state);
  if (start.some((c) => c === undefined)) throw new Error('Invalid training state');
  return searchProjections({ start, graphs,
    bound: (s) => {
      let best = 0;
      for (const { i, j, distance } of pruning) best = Math.max(best, distance[j === null ? s[i] : s[i] * graphs[j].size + s[j]]);
      return best;
    },
    goal: (s) => completed.has(s.join(',')) ? [{ first: completed.get(s.join(',')) }] : [],
  }, { ...options, firstSolution: true });
}
