import { writeFile } from "node:fs/promises";

// Lift the approved drawing onto the +Y octahedron surface, then pitch the
// orthographic camera toward the white top face. Bake coordinates so the black
// strokes stay the same width instead of stretching with the drawing.
const degrees = Number(process.argv[2] ?? 12);
if (!Number.isFinite(degrees) || degrees < 0 || degrees > 30)
  throw new Error("Choose a camera tilt between 0 and 30 degrees.");
const angle = (degrees * Math.PI) / 180;
const project = ([screenX, screenY]) => {
  const diagonal = (160 - screenY) / 52;
  const horizontal = (screenX - 160) / 52;
  const x = (diagonal - horizontal) / 2;
  const z = (diagonal + horizontal) / 2;
  const y = 3 - Math.abs(x) - Math.abs(z);
  return [
    screenX,
    160 -
      52 * Math.cos(angle) * (x + z) +
      52 * Math.SQRT2 * Math.sin(angle) * y,
  ];
};
const outline = [
  [4, 4],
  [316, 4],
  [316, 108],
  [264, 160],
  [56, 160],
  [4, 108],
];
const aperture = [
  [108, 108],
  [212, 108],
  [264, 160],
  [56, 160],
];
const red = [
  [
    [4, 4],
    [56, 56],
    [4, 108],
  ],
  [
    [4, 108],
    [56, 56],
    [56, 160],
  ],
  [
    [56, 56],
    [108, 108],
    [56, 160],
  ],
];
const blue = [
  [
    [316, 4],
    [316, 108],
    [264, 56],
  ],
  [
    [316, 108],
    [264, 160],
    [264, 56],
  ],
  [
    [264, 56],
    [264, 160],
    [212, 108],
  ],
];
// Only the visible white trapezoid is needed; its masked tip must not emerge
// below the cropped silhouette when the camera pitches upward.
const white = [
  [4, 4],
  [316, 4],
  [212, 108],
  [108, 108],
];
const grid = [
  [
    [108, 4],
    [212, 108],
  ],
  [
    [212, 4],
    [108, 108],
  ],
  [
    [56, 56],
    [264, 56],
  ],
  [
    [108, 4],
    [56, 56],
  ],
  [
    [212, 4],
    [264, 56],
  ],
];
const round = (n) => Number(n.toFixed(3));
const path = (points, closed = true) =>
  points
    .map((p, i) => `${i ? "L" : "M"}${project(p).map(round).join(" ")}`)
    .join("") + (closed ? "Z" : "");
const ys = outline.map((p) => project(p)[1]);
const top = Math.floor(Math.min(...ys) - 4);
const height = Math.ceil(Math.max(...ys) + 4) - top;
const cut = path(aperture);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${top} 320 ${height}" fill="none">
  <title>First Block</title>
  <!-- Orthographic camera tilted ${degrees} degrees toward the white top face. -->
  <defs>
    <mask id="front-cut" maskUnits="userSpaceOnUse" x="0" y="${top}" width="320" height="${height}" style="mask-type:luminance">
      <rect y="${top}" width="320" height="${height}" fill="white"/>
      <path d="${cut}" fill="black"/>
    </mask>
  </defs>
  <g mask="url(#front-cut)" stroke="#000" stroke-width="3.5" stroke-linejoin="round">
    <path d="${path(outline)}" fill="#000"/>
    <g fill="#ff3038">${red.map((p) => `\n      <path d="${path(p)}"/>`).join("")}
    </g>
    <g fill="#087bff">${blue.map((p) => `\n      <path d="${path(p)}"/>`).join("")}
    </g>
    <path d="${path(white)}" fill="#fff"/>
    <path d="${grid.map((p) => path(p, false)).join("")}"/>
  </g>
  <path d="${cut}" stroke="#000" stroke-width="3.5" stroke-linejoin="round"/>
</svg>
`;
await Promise.all(
  ["logo.svg", "favicon.svg"].map((name) =>
    writeFile(new URL(`../public/${name}`, import.meta.url), svg),
  ),
);
