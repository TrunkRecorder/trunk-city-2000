// What a call on a talkgroup sets going in its city, by the talkgroup's
// type. Not what the call is really about (nobody here knows that, and an
// encrypted call says nothing at all): just something of the right kind, so
// the city is as busy as the radio is.
//
// A scenario's `act` is how it plays out (city.js): "respond" sends its
// `units` from the talkgroup's home to `at` and puts `fx` there; "ambulance"
// goes on to a hospital; "chase", "bus", "train", "plane", "heli",
// "convoy", "route", "mower", "crowd", "tower", "patrol" are their own
// little plays. `news` are headlines: {street} is where, {place} the
// building's name, {who} the home's name.

export const SCENARIOS = [
  // ── Fire ──
  { type: "fire", w: 5, act: "respond", units: ["engine", "ladder"], at: "house", fx: "fire", news: ["House fire on {street}! Crews on the way", "Smoke showing at a home on {street}", "Kitchen fire on {street}: everyone's out safe"] },
  { type: "fire", w: 3, act: "respond", units: ["ladder"], at: "tree", fx: "kitten", news: ["Kitten up a tree near {street}. Ladder truck rolling", "Cat declines to come down from a tree on {street}", "Feline stuck in an oak on {street}; ladder requested"] },
  { type: "fire", w: 3, act: "respond", units: ["engine", "ambulance"], at: "road", fx: "crash", news: ["Fender-bender at {street}: engine and medic responding", "Two cars meet unexpectedly on {street}", "Crash on {street}; traffic slowed"] },
  { type: "fire", w: 2, act: "respond", units: ["engine"], at: "shop", fx: "smoke", news: ["Smoke alarm at {place} on {street}: burnt toast suspected", "Alarm sounding at {place}", "Engine checks out a smell of smoke on {street}"] },
  { type: "fire", w: 1, act: "respond", units: ["engine"], at: "office", fx: "fire", news: ["Fire alarm in a tower on {street}; crews going up", "Office tower on {street} evacuated, fire reported on an upper floor"] },
  { type: "fire", w: 1, act: "respond", units: ["engine"], at: "park", fx: "fire", news: ["Brush fire in the park off {street}", "Grill gets out of hand at a picnic near {street}"] },
  // ── EMS ──
  { type: "ems", w: 5, act: "ambulance", units: ["ambulance"], at: "house", fx: null, news: ["Medic responding to a home on {street}", "Ambulance on its way to {street}", "Someone on {street} isn't feeling well; help is coming"] },
  { type: "ems", w: 2, act: "ambulance", units: ["ambulance"], at: "park", fx: null, news: ["Twisted ankle at the park off {street}", "Bee sting at a picnic near {street}"] },
  { type: "ems", w: 1, act: "ambulance", units: ["ambulance"], at: "shop", fx: null, news: ["Medic called to {place} on {street}"] },
  // ── Police ──
  { type: "police", w: 4, act: "respond", units: ["police"], at: "house", fx: null, news: ["Officers check on a noise complaint on {street}", "Police respond to a call on {street}", "Patrol car sent to {street}"] },
  { type: "police", w: 3, act: "chase", units: ["police", "police"], at: "road", fx: null, news: ["Speeder leads police on a chase down {street}", "Officers pursuing a car near {street}", "Fast car, faster police on {street}"] },
  { type: "police", w: 2, act: "respond", units: ["police"], at: "shop", fx: null, news: ["Alarm at {place} on {street}; officers checking", "Shoplifter reported at {place}"] },
  { type: "police", w: 2, act: "respond", units: ["police"], at: "road", fx: "ducks", news: ["Officer stops traffic on {street} for a family of ducks", "Ducks cross {street} under police escort"] },
  { type: "police", w: 1, act: "respond", units: ["police", "police"], at: "office", fx: null, news: ["Officers at a downtown tower on {street}"] },
  { type: "police", flavor: "secret", w: 4, act: "respond", units: ["suv"], at: "road", fx: null, news: ["Unmarked car parks on {street}. Nothing to see here", "Something quiet is happening on {street}"] },
  // ── Hospitals ──
  { type: "hospital", w: 3, act: "heli", units: [], at: "hospital", fx: null, news: ["Medical helicopter landing at {place}", "Air ambulance inbound to {place}"] },
  { type: "hospital", w: 3, act: "respond", units: ["ambulance"], at: "hospital", fx: null, news: ["Ambulance arrives at {place}", "{place} is expecting a patient"] },
  // ── Emergency management / interop ──
  { type: "emergency", w: 3, act: "convoy", units: ["engine", "police", "ambulance"], at: "hall", fx: null, news: ["Mutual aid arrives from the next town over", "Neighboring crews roll into town to help", "Units from three agencies gather near {place}"] },
  { type: "emergency", w: 2, act: "siren", units: [], at: "eoc", fx: "rings", news: ["The Emergency Operations Center lights up", "Sirens tested: this is only a test", "Emergency managers huddle at {place}"] },
  // ── Transit ──
  { type: "transit", flavor: "rail", w: 6, act: "train", units: [], at: "rail", fx: null, news: ["Train departs {place}", "{place}: train arriving on platform 1", "Rail control talks to a train near {place}"] },
  { type: "transit", flavor: "bus", w: 6, act: "bus", units: ["bus"], at: "road", fx: null, news: ["Bus {num} is running a little late on {street}", "Bus {num} detours around {street}", "New bus out on route {num}"] },
  { type: "transit", w: 3, act: "bus", units: ["bus"], at: "road", fx: null, news: ["Bus {num} leaves the depot", "Bus {num} on {street}"] },
  // ── Schools ──
  { type: "schools", w: 4, act: "route", units: ["schoolbus"], at: "house", fx: null, news: ["School bus making its rounds on {street}", "Students board the bus on {street}", "School bus {num} running its route"] },
  { type: "schools", w: 1, act: "crowd", units: [], at: "home", fx: null, news: ["Recess at {place}!", "Fire drill at {place}: everyone out on the lawn"] },
  // ── Airport ──
  { type: "airport", w: 5, act: "plane", units: [], at: "runway", fx: null, news: ["Flight {num} cleared for takeoff", "Flight {num} departing", "Airport operations: all clear on the runway"] },
  // ── Utilities ──
  { type: "utilities", flavor: "water", w: 4, act: "respond", units: ["van"], at: "road", fx: "geyser", news: ["Water main break on {street}!", "{street} has a new fountain (a water main broke)", "Water crews digging on {street}"] },
  { type: "utilities", flavor: "power", w: 4, act: "respond", units: ["bucket"], at: "house", fx: "sparks", news: ["Power line down on {street}; crews responding", "Lights flicker on {street}; the utility is on it"] },
  { type: "utilities", w: 2, act: "respond", units: ["van"], at: "road", fx: "cones", news: ["Utility crew working on {street}", "Meter reading on {street}"] },
  // ── Public works ──
  { type: "publicworks", w: 4, act: "respond", units: ["dump"], at: "road", fx: "cones", news: ["Pothole patrol fixing {street}", "Road crew on {street}: expect delays", "Public works paving a stretch of {street}"] },
  { type: "publicworks", flavor: "sanitation", w: 5, act: "route", units: ["garbage"], at: "house", fx: null, news: ["Trash day on {street}", "Garbage truck making its rounds on {street}"] },
  { type: "publicworks", w: 2, act: "route", units: ["garbage"], at: "house", fx: null, news: ["Garbage truck making its rounds on {street}", "Recycling pickup on {street}"] },
  { type: "publicworks", flavor: "snow", w: 5, act: "route", units: ["plow"], at: "road", fx: null, news: ["Plows out on {street}", "Salt trucks rolling down {street}"] },
  { type: "publicworks", flavor: "traffic", w: 4, act: "respond", units: ["bucket"], at: "road", fx: "cones", news: ["Traffic signal repair at {street}", "Signal out on {street}: treat it as a four-way stop"] },
  { type: "publicworks", flavor: "rail", w: 4, act: "respond", units: ["dump"], at: "railroad", fx: "cones", news: ["Track crew working near {place}", "Maintenance on the rails near {place}"] },
  { type: "publicworks", w: 1, act: "respond", units: ["bucket"], at: "tree", fx: "leaves", news: ["Tree trimming on {street}"] },
  // ── Animal control ──
  { type: "animal", w: 4, act: "respond", units: ["van"], at: "house", fx: "dog", news: ["Loose dog on {street}! Animal control in pursuit", "A very good dog is on the run on {street}", "Animal control called about a raccoon on {street}"] },
  { type: "animal", w: 1, act: "respond", units: ["van"], at: "pasture", fx: null, news: ["Cow escapes {place}", "Animal control rounds up goats at {place}"] },
  // ── Parks ──
  { type: "parks", w: 3, act: "mower", units: [], at: "park", fx: null, news: ["Mowing the lawn at {place}", "Parks crew tidying up near {street}"] },
  { type: "parks", w: 2, act: "respond", units: ["icecream"], at: "park", fx: null, news: ["Ice cream truck spotted near the park on {street}", "Parks and Rec hosts a picnic near {street}"] },
  // ── Corrections ──
  { type: "corrections", w: 3, act: "respond", units: ["prison"], at: "hall", fx: null, news: ["Prisoner transport heads to court", "Jail van on {street}"] },
  { type: "corrections", w: 1, act: "crowd", units: [], at: "home", fx: null, news: ["Yard time at {place}"] },
  // ── Security ──
  { type: "security", w: 3, act: "patrol", units: ["car"], at: "home", fx: null, news: ["Security making rounds near {place}", "Guard checks the doors at {place}"] },
  // ── Military ──
  { type: "military", w: 2, act: "convoy", units: ["army", "army"], at: "home", fx: null, news: ["National Guard trucks roll through town", "Guard convoy heads to {place}"] },
  { type: "military", w: 2, act: "heli", units: [], at: "home", fx: null, heli: 0x5a6438, news: ["Guard helicopter overhead", "Military helicopter flies over {street}"] },
  // ── Federal ──
  { type: "federal", w: 3, act: "convoy", units: ["suv", "limo", "suv"], at: "hall", fx: null, news: ["Motorcade passes through downtown", "Black SUVs spotted on {street}", "Federal agents visit {place}"] },
  // ── City government ──
  { type: "government", w: 3, act: "respond", units: ["limo"], at: "hall", fx: null, news: ["The mayor arrives at City Hall", "Council meeting running long at City Hall", "Ribbon-cutting on {street}"] },
  { type: "government", w: 2, act: "crowd", units: [], at: "hall", fx: null, news: ["Press conference on the City Hall steps", "Town hall meeting draws a crowd"] },
  // ── Events ──
  { type: "events", w: 3, act: "crowd", units: [], at: "home", fx: "fireworks", news: ["Big game at {place}!", "Concert tonight at {place}", "Fans pour into {place}"] },
  { type: "events", w: 2, act: "convoy", units: ["police", "police"], at: "home", fx: null, news: ["Officers set up for the parade on {street}", "Special event traffic near {place}"] },
  // ── Everything else ──
  { type: "other", w: 3, act: "tower", units: [], at: "tower", fx: null, news: ["The radio tower crackles", "Mysterious transmission picked up at {place}", "Chatter on an unlisted channel"] },
];

/** A scenario for a call of `type` (and `flavor`), picked with `rnd` (0..1). */
export function pickScenario(type, flavor, rnd, month = new Date().getMonth()) {
  let list = SCENARIOS.filter((s) => s.type === type && (!s.flavor || s.flavor === flavor));
  // Plows come out in winter only; the rest of the year they patch roads.
  if (!(month <= 2 || month === 11)) list = list.filter((s) => !(s.units.includes("plow")));
  // A flavor's own scenarios crowd out the general ones.
  if (flavor && list.some((s) => s.flavor === flavor)) list = list.filter((s) => s.flavor === flavor || s.w <= 1);
  if (!list.length) list = SCENARIOS.filter((s) => s.type === "other");
  let total = list.reduce((a, s) => a + s.w, 0);
  let r = rnd * total;
  for (const s of list) if ((r -= s.w) < 0) return s;
  return list[list.length - 1];
}

/** Fills in a headline: { street, place, who, num }. */
export function headline(template, fill) {
  return template.replace(/\{(\w+)\}/g, (_, k) => fill[k] ?? "");
}

// ── Whimsy: the things that happen for no reason at all ──────────────────────

export const WHIMSY = [
  { id: "ufo", w: 3, news: ["Farmer reports a missing cow. Witnesses describe a “very shiny saucer”", "UFO sighted over {place}: one cow unaccounted for", "Strange lights over {place}; cows nervous"] },
  { id: "balloon", w: 3, news: ["Hot-air balloon drifts over town", "Balloonist waves to the folks below", "A balloon floats lazily across the sky"] },
  { id: "blimp", w: 2, news: ["The Trunk City blimp is overhead", "Blimp spotted. Nobody knows who sent it"] },
  { id: "birds", w: 4, news: ["Geese heading south over {street}", "A flock of birds passes over town"] },
  { id: "ducks", w: 2, news: ["Ducks cross {street}. Traffic waits politely"] },
  { id: "bigfoot", w: 1, news: ["Blurry photo of Bigfoot taken in the woods outside town", "Hiker swears they saw something big and hairy"] },
  { id: "sleigh", w: 3, month: 11, news: ["Reports of a sleigh over the rooftops", "Radar picks up eight tiny reindeer"] },
  { id: "plane", w: 2, news: ["A plane passes high over the city", "Crop duster buzzes {place}"] },
];
