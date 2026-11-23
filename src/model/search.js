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
  const bases = all.filter((v) =>
    v.first.every(([id, c]) => solved[id].color === c),
  );
  const required = bases.map((v) => new Set(v.first.map(([id]) => id)));
  const edgeIds = groups
    .filter((p) => p.length === 2 && p.some((s) => required[0].has(s)))
    .map((p) => p.find((s) => edgeOrbit.includes(s)));
  const cornerIds = required.map((set) =>
    groups
      .filter((p) => p.length === 4 && p.some((s) => set.has(s)))
      .map((p) => p.find((s) => cornerOrbit.includes(s))),
  );
  const faceIds = faceOrbit.filter((s) => solved[s].color === color);
  function graph(key, orbit, ids, mode) {
    if (!graphCache.has(key)) graphCache.set(key, automaton(orbit, ids, mode));
    return graphCache.get(key);
  }
  progress("Building exact projection graphs");
  const edge = graph(`e${edgeIds}`, edgeOrbit, edgeIds),
    face = graph(`f${color}`, faceOrbit, faceIds, "set");
  const center = graph(`center${otherOrbit[0]}`, otherOrbit, null, "colors");
  const corners = cornerIds.map((ids) => graph(`c${ids}`, cornerOrbit, ids));
  const coordinate = (a, ids, r) => {
    const ps = ids.map((id) => a.local.get(g.permutations[r][id]));
    return ps.some((p) => p === undefined)
      ? undefined
      : a.index.get(a.encode(ps));
  };
  const options = bases.map((base, i) => {
    const targets = all
      .filter((v) => v.up === base.up)
      .flatMap((v) => {
        const e = coordinate(edge, edgeIds, v.rotation),
          f = coordinate(face, faceIds, v.rotation),
          c = coordinate(corners[i], cornerIds[i], v.rotation);
        if (e === undefined || f === undefined || c === undefined) return [];
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
        return [{ e, f, c, constraints, variant: v }];
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
        targets.map((t) => t.e * corners[i].size + t.c),
      ),
    };
  });
  const def = distances(
    edge,
    face,
    options.flatMap((o) => o.targets.map((t) => t.e * face.size + t.f)),
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
  for (const id of t.center.orbit)
    colors[t.center.local.get(ps[id])] = t.center.palette.indexOf(
      solved[id].color,
    );
  return [
    positional(t.edge, t.edgeIds),
    positional(t.face, t.faceIds),
    t.center.index.get(t.center.encode(colors)),
    ...t.corners.map((c, i) => positional(c, t.cornerIds[i])),
  ];
}
export function solve(
  t,
  scramble,
  { onProgress = () => {}, onSolution = () => {}, maxNodes = Infinity } = {},
) {
  const start = initialCoordinates(t, scramble),
    graphs = [t.edge, t.face, t.center, ...t.corners];
  let nodes = 0,
    count = 0;
  const path = [],
    frames = Array.from({ length: 128 }, () => new Uint32Array(graphs.length));
  function heuristic(s) {
    const ef = t.def[s[0] * t.face.size + s[1]];
    let best = 255;
    for (let i = 0; i < t.options.length; i++) {
      const o = t.options[i],
        h = Math.max(ef, o.dc[s[2]], o.dec[s[0] * o.corner.size + s[3 + i]]);
      if (h < best) best = h;
    }
    return best;
  }
  function goal(s) {
    for (let i = 0; i < t.options.length; i++)
      for (const target of t.options[i].targets)
        if (
          target.e === s[0] &&
          target.f === s[1] &&
          target.c === s[3 + i] &&
          target.constraints.every(
            ([p, c]) => ((t.center.codes[s[2]] >>> (p * 2)) & 3) === c,
          )
        )
          return target.variant;
    return null;
  }
  function visit(s, remaining, last, level) {
    nodes++;
    if (nodes > maxNodes) throw new Error("Search node limit reached");
    if ((nodes & 262143) === 0) onProgress({ depth, nodes, count });
    if (heuristic(s) > remaining) return;
    if (!remaining) {
      const target = goal(s);
      if (target) {
        count++;
        onSolution({ moves: [...path], target });
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
    }
  }
  let depth = heuristic(start);
  for (; ; depth++) {
    onProgress({ depth, nodes, count });
    visit(start, depth, -1, 0);
    if (count) return { depth, nodes, count };
  }
}
