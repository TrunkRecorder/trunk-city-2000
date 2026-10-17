// The map's geometry: tile (i, j) has its top vertex at screen (x, y) =
// ((i - j) · 16, (i + j) · 8). i runs down-right, j down-left.

export const TW = 32;
export const TH = 16;

export const toScreen = (i, j) => [(i - j) * (TW / 2), (i + j) * (TH / 2)];

/** The tile under screen point (x, y), as fractions. */
export const toTile = (x, y) => [y / TH + x / TW, y / TH - x / TW];

/** The four neighbours: i - 1 (NW), j - 1 (NE), i + 1 (SE), j + 1 (SW). */
export const DIRS = [
  [-1, 0],
  [0, -1],
  [1, 0],
  [0, 1],
];
export const NW = 1,
  NE = 2,
  SE = 4,
  SW = 8;
