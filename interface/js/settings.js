// What this viewer has chosen: which systems get a city, which talkgroups
// count and what kind of thing each one is, the view. Kept in this
// browser (localStorage), since an interface with listen access can't, and
// shouldn't, change the recorder's config.

const KEY = "trunk-city-2000";

const DEFAULTS = {
  /** short name → { on?: boolean, tgs: { [talkgroup]: { on?: boolean, type?: string } } } */
  systems: {},
  view: "single",
  current: null,
  /** The systems in the quad view's four places (short names, or null). */
  quad: [null, null, null, null],
  whimsy: true,
  /** Calls on talkgroups that aren't in the talkgroup file: shown as "other". */
  unknown: false,
  /** Background traffic: "none", "light" or "normal". Light, so what the radio does stands out. */
  traffic: "light",
  /** The city faded (less color and light), and what's on the radio at full strength. */
  dim: false,
  /** Radios with no name labeled by their ID. */
  unitIds: false,
  /** The camera follows whoever's talking. */
  follow: false,
};

export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    // 0.2 faded the city by default and saved that; it's off now, once.
    if ((s.v ?? 1) < 2) delete s.dim;
    return { ...structuredClone(DEFAULTS), ...s, systems: s.systems ?? {}, v: 2 };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function save(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private windows and full storage: the choices last until the page closes.
  }
}

/** A system's own settings, made if they aren't there. */
export function sys(s, short) {
  return (s.systems[short] ??= { tgs: {} });
}
