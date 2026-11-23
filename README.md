# FTO / First block

A local React + Vite application for finding **all shortest first-block solutions** for any of the eight colors. No backend, account, or hosted solver is needed.

```sh
npm install
npm run dev
```

Open the printed local URL (normally http://127.0.0.1:5173).

```sh
npm test
npm run build
```

## Block and move definitions

The first block uses the exact `builtinPatterns()` definition from the neighboring FTO-simulator. There are three choices of the omitted triple. Each choice can finish in **12 reachable poses: four orbit faces × three orientations**. All 36 targets are searched together; there is no fixed final orientation or required omitted triple.

A finished block has 12 physical pieces (21 stickers): two corners, three edges, and seven centers. The union of all three candidate blocks contains 15 physical pieces. The viewer additionally defines all interchangeable centers of the block's four colors, displaying **18 physical pieces (30 stickers): three corners, three edges, the block color’s three centers, and nine centers from the other orbit**. Every other piece is black. This fixed mask follows piece identity through turns and stays the same across solution cards, so a required same-color center is never hidden. The initial and reset camera use the simulator’s CIF hold.

Both directions of the 120° turns on U, R, F, L, B, D, BR, and BL cost one move. Scramble input, printed solutions, playback, and destination face labels all use conventional **CIF/csTimer notation**, mapped explicitly to the simulator’s internal geometric faces. Scramble notation accepts whitespace-separated face turns, case-insensitively, with a prime (straight or curly) or `2` for the inverse direction. Rotations, wide turns, comments, and nested algorithm notation are not accepted. An empty scramble is the solved puzzle.

## Exact search

The browser worker builds small exact projection graphs directly from the simulator's integer-lattice move permutations:

- Three distinguished edges: 1,320 states.
- Three interchangeable centers of the selected color: 220 states.
- The other center orbit: 369,600 color configurations.
- Two distinguished corners per omitted-triple choice: 120 states each.

Multi-source breadth-first search produces exact distance databases for edges + selected centers, edges + corners for each block choice, and the other center orbit for each block choice. Sources include all 12 reachable poses, with unconstrained centers filled in all legal ways.

The lower bound is the minimum over block choices of the maximum of the corresponding projection distances. Iterative deepening starts at this admissible bound and checks the complete correlated target at leaves. It only removes consecutive turns of the same face, which cannot occur in a shortest sequence. There is no transposition pruning, commuting-order suppression, depth cap, or solution-count cap: all shortest sequences are retained, including commuting orders. “Optimality proven” appears only when the entire first successful depth is exhausted. Stopping terminates the worker and explicitly leaves enumeration incomplete.

These exact tables provide safe pruning without the false positives of a Bloom filter. They exhaust the abstract spaces instead of imposing a depth-eight cutoff. First preparation generally takes a few seconds; graphs and tables remain cached in the worker for subsequent searches. They are rebuilt after a page reload or cancellation. No tables are downloaded or persisted. Long searches and very large result sets can still be expensive, especially on mobile; results stream in batches and render 60 cards per page.

The virtual FTO supports drag-to-orbit, zoom, automatic card playback, pause, step forward/back, speed selection, reset view, and facing the completed block.

## Validation

The Node tests compare all 72 sticker destinations for all 16 turns against a frozen independent csTimer cubie reference, reproduce the reported scramble and replay every solution through that reference, and check inverse/order-three moves, notation, the complete 18-piece mask, all colors and all 12 poses, agreement with an independent exhaustive shallow solver (including the complete solution set), and replay of longer-scramble solutions against the original simulator block detector.

## Source and license

This project is GPL-3.0-only. The integer-lattice geometry, phase patterns, and Three.js viewer modules in `src/model/` and `src/vendor/` are adapted from the neighboring **FTO-simulator** project. The solver architecture also draws on the pruning and iterative-deepening approach in **FTO-alg-finder**. The black masking and buffer allocation correction are local viewer modifications. See [LICENSE](LICENSE).

Frontend changes stay local until the owner has hand-tested and explicitly requests deployment, as required by the parent workspace's `AGENTS.md`.
