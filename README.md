# FTO / First block

A local React + Vite application for finding **all shortest FB, FC+1, Arrow, and First center solutions** for any of the eight colors. No backend, account, or hosted solver is needed.

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

**FC+1** solves the six-piece first center plus one triplet (one corner and two centers): **9 physical pieces / 15 stickers**. It searches all three triplet choices and all 12 poses. FB instead solves the first center plus two triplets (12 pieces). The mode selector switches between these goals; search tables are cached separately for each color and mode.

**Arrow** solves the six-piece top of FC+1: one corner, its two adjacent edges, and three centers (11 stickers). The bottom edge and two bottom centers are unconstrained. It searches all three arrows around the selected color in all 12 poses.

**First center** solves three edges and the block color’s three centers (6 pieces / 9 stickers), in any of the 12 orbit poses. Corners and other-orbit centers are unconstrained.

A finished block has 12 physical pieces (21 stickers): two corners, three edges, and seven centers. The union of all three candidate blocks contains 15 physical pieces. The viewer additionally defines all interchangeable centers of the block's four colors, displaying **18 physical pieces (30 stickers): three corners, three edges, the block color’s three centers, and nine centers from the other orbit**. Every other piece is dark gray, with pitch-black outlines. This fixed mask follows piece identity through turns and stays the same across solution cards, so a required same-color center is never hidden. The initial and reset camera use the simulator’s CIF hold.

Both directions of the 120° turns on U, R, F, L, B, D, BR, and BL cost one move. Scramble input, printed solutions, playback all use conventional **CIF/csTimer notation**, mapped explicitly to the simulator’s internal geometric faces. Scramble notation accepts whitespace-separated face turns, case-insensitively, with a prime (straight or curly) or `2` for the inverse direction. Rotations, wide turns, comments, and nested algorithm notation are not accepted. An empty scramble is the solved puzzle.

## Exact search

The browser worker builds small exact projection graphs directly from the simulator's integer-lattice move permutations:

- Three distinguished edges: 1,320 states.
- Three interchangeable centers of the selected color: 220 states.
- The other center orbit: 369,600 color configurations.
- FB: two distinguished corners per omitted-triple choice, 120 states each.
- FC+1 and Arrow: one distinguished corner per choice, 12 states each.
- First center: no corner or other-center graph; these coordinates have one unconstrained state.

Multi-source breadth-first search produces exact distance databases for edges + selected centers, edges + corners for each block choice, and the other center orbit for each block choice. Sources include all 12 reachable poses, with unconstrained pieces filled in all legal ways. Arrow targets accept any position of the omitted edge and either of the two unused block-color centers; pruning and goal checks constrain only the six required pieces.

The lower bound is the minimum over block choices of the maximum of the corresponding projection distances. Iterative deepening starts at this admissible bound and checks the complete correlated target at leaves. It only removes consecutive turns of the same face, which cannot occur in a shortest sequence. There is no transposition pruning, commuting-order suppression, depth cap, or solution-count cap: all shortest sequences are retained, including commuting orders. The final move and solution counts appear only when the entire first successful depth is exhausted. Stopping terminates the worker and explicitly leaves enumeration incomplete.

These exact tables provide safe pruning without the false positives of a Bloom filter. They exhaust the abstract spaces instead of imposing a depth-eight cutoff. First preparation generally takes a few seconds; graphs and tables remain cached in the worker for subsequent searches. They are rebuilt after a page reload or cancellation. No tables are downloaded or persisted. Long searches and very large result sets can still be expensive, especially on mobile; results stream in batches and render 60 cards per page.

The **Back stickers** toggle borrows the offset rear-face sheets from FTO-simulator inspection mode, preserving the dark-gray undefined pieces and pitch-black outlines. Sheets follow camera orbit, refresh at every completed move, and are hidden during an in-progress turn, matching inspection’s settled-face behavior.

The virtual FTO supports drag-to-orbit, zoom, automatic card playback, pause, step forward/back, speed selection, reset view, and facing the completed block.

## Validation

The Node tests compare all 72 sticker destinations for all 16 turns against a frozen independent csTimer cubie reference, reproduce the reported scramble and replay every solution through that reference, and check inverse/order-three moves, notation, the complete 18-piece mask, all colors and all 12 poses, agreement with an independent exhaustive shallow solver (including the complete solution set), and replay of longer-scramble solutions against the original simulator block detector.

## Source and license

This project is GPL-3.0-only. The integer-lattice geometry, phase patterns, and Three.js viewer modules in `src/model/` and `src/vendor/` are adapted from the neighboring **FTO-simulator** project. The solver architecture also draws on the pruning and iterative-deepening approach in **FTO-alg-finder**. The undefined-piece masking, rear-face sheets, and buffer allocation correction are local viewer modifications. See [LICENSE](LICENSE).

Frontend changes stay local until the owner has hand-tested and explicitly requests deployment, as required by the parent workspace's `AGENTS.md`.
