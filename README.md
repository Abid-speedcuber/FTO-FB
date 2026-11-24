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

Select one or more colors using the round checkboxes. Search compares their goals at the same depth and shows every solution tied for the **shortest length across the selected colors**; longer per-color solutions are omitted. Each card identifies its color. A color/algorithm pair remains a separate card when one sequence solves more than one selected color, so its piece view is unambiguous.

## Block and move definitions

The first block uses the exact `builtinPatterns()` definition from the neighboring FTO-simulator. There are three choices of the omitted triple. Each choice can finish in **12 reachable poses: four orbit faces × three orientations**. All 36 targets are searched together; there is no fixed final orientation or required omitted triple.

**FC+1** solves the six-piece first center plus one triplet (one corner and two centers): **9 physical pieces / 15 stickers**. It searches all three triplet choices and all 12 poses. FB instead solves the first center plus two triplets (12 pieces). The mode selector switches between these goals; search tables are cached separately for each color and mode.

**Arrow** solves the six-piece top of FC+1: one corner, its two adjacent edges, and three centers (11 stickers). The bottom edge and two bottom centers are unconstrained. It searches all three arrows around the selected color in all 12 poses.

**First center** solves three edges and the block color’s three centers (6 pieces / 9 stickers), in any of the 12 orbit poses. Corners and other-orbit centers are unconstrained.

**Pseudo Arrow** and **Pseudo FC+1** use the same attachment shapes as Arrow and FC+1. At each slot, any of the three triplets containing the selected color may be placed in either orientation: six possibilities. Each triplet must remain internally formed (its two centers match its corner), but it need not match the surrounding first-center pieces. All three slots and all 12 orbit poses are searched together.

A finished block has 12 physical pieces (21 stickers). In Solver, the viewer defines all **18 relevant physical pieces (30 stickers)** for the selected card’s color: three corners, three edges, three block-color centers, and nine centers from the other orbit. These identities stay visible throughout playback, including pieces outside the solved target. Other pieces remain dark gray with pitch-black outlines. Pressing Solve immediately displays the scramble with the relevant pieces for all searched colors. Selecting a card narrows visibility to that card’s color. First center mode defines only its six relevant pieces (three edges and three centers, nine stickers), both before card selection and throughout playback. Case-list previews define only their pattern’s pieces. The initial and reset camera use the simulator’s CIF hold.

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

These exact tables provide safe pruning without the false positives of a Bloom filter. They exhaust the abstract spaces instead of imposing a depth-eight cutoff. First preparation generally takes a few seconds. Graphs and distance tables are saved locally in **IndexedDB** (the tables are too large for the small `localStorage` quota) and reused after reloads and cancellation. Shared graphs are stored once across modes and colors. Cache keys include the storage format, move permutations, and goal definitions, so incompatible tables are rebuilt automatically. Saving is atomic; unavailable storage or quota failures fall back to solving in memory. Clearing this site’s browser data removes the saved tables. No tables are downloaded. Long searches and very large result sets can still be expensive, especially on mobile; results stream in batches and render 60 cards per page.

The **Back stickers** toggle borrows the offset rear-face sheets from FTO-simulator inspection mode, preserving the dark-gray undefined pieces and pitch-black outlines. Sheets follow camera orbit and rotate with their corresponding layers throughout each animated turn.

The virtual FTO supports drag-to-orbit, zoom, automatic card playback, pause, step forward/back, speed selection, reset view, and facing the completed block.

## Validation

The Node tests compare all 72 sticker destinations for all 16 turns against a frozen independent csTimer cubie reference, reproduce the reported scramble and replay every solution through that reference, and check inverse/order-three moves, notation, the complete candidate pool and card-specific piece masks, all colors and all 12 poses, agreement with an independent exhaustive shallow solver (including the complete solution set), and replay of longer-scramble solutions against the original simulator block detector.

## Saved sessions

The current Solver session is saved locally: draft scramble, chosen mode/colors, last searched scramble, solution cards, selected card/result page, and solver status. Reload restores the viewer’s camera, exact playback position (including a paused turn), speed, and back-sticker setting, with playback paused. Goal descriptions are deduplicated in storage to keep result lists compact. A search interrupted by reload retains its partial results and is marked incomplete; press Solve to search again. App view and Case list type/distance/page also persist. These preferences use local storage, separately from the solver’s IndexedDB pruning tables.

## Case list

Choose **Case list** in the top-bar dropdown, then choose Arrow block, FC+1, or Center and a separate 1–4 move distance. Each page contains 40 JSON entries; Arrow and FC+1 derive a second mirror card beside each entry (consecutive cards on narrow screens). Center uses two independent cards per wide-screen row. Only one focused card creates a live orbitable/animated viewer. Visible static thumbnails are generated gradually by one shared renderer and kept in a bounded cache; offscreen cards do not allocate renderers.

`public/cases/<type>/<depth>.json` contains the precalculated entries, one object per line. Edit `name` to label recognizable patterns and reorder objects to change their display order. The UI never sorts the records. Mirrors are not stored in these files; they are derived using R ↔ L′, BR ↔ BL′, and direction reversal for U/D/B/F.

Regenerate with `npm run generate:cases`. Existing names and edited order are preserved, with new entries appended. BFS seeds are fixed in the pictured F-face/top position: white/red and white/purple edges with the purple/blue triplet flipped for Arrow and FC+1. All undefined pieces are genuinely absent from the partial BFS state. The three defined white centers in Center and FC+1 are interchangeable; Arrow has only one white center. Shorter-state rejection uses multi-source unrestricted face-turn BFS through depth 3 from every compatible completed formation on any face or slot (24 Arrow, 72 FC+1, 12 Center), using only the same defined pieces. Undefined pieces can never substitute. Thus a two-move route back to the pictured seed is removed if those pieces already form another slot or can finish there in one move. Listed paths start only with the requested moves: R/R′ for Center; R/R′/L/L′/U/U′ for Arrow; R/R′/L/L′/D/D′/U/U′ for FC+1. Equal-depth paths to the same defined pattern are grouped into one entry with a `solutions` array. Alternatives connected by adjacent swaps that commute on the defined pieces at that point in the solution are collapsed; this includes partial-piece commutation even when the moves do not commute on the full puzzle. Genuinely different shortest routes remain together on the card, with a selectable algorithm for playback. Mirrored patterns are grouped together too, with the mirror algorithms derived rather than stored. Stored algorithms are solutions, so their last move is the inverse of the restricted first BFS move.

## Source and license

This project is GPL-3.0-only. The integer-lattice geometry, phase patterns, and Three.js viewer modules in `src/model/` and `src/vendor/` are adapted from the neighboring **FTO-simulator** project. The solver architecture also draws on the pruning and iterative-deepening approach in **FTO-alg-finder**. The undefined-piece masking, rear-face sheets, and buffer allocation correction are local viewer modifications. See [LICENSE](LICENSE).

Frontend changes stay local until the owner has hand-tested and explicitly requests deployment, as required by the parent workspace's `AGENTS.md`.
