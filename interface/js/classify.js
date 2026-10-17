// Which part of the city a talkgroup belongs to, from what its talkgroup
// file says about it: RadioReference's Tag (a fixed list), its Category (the
// group: free text, mostly an agency's or a place's name), its Alpha Tag and
// its Description.
//
// No one field is enough. The Tag is the best guide, but "Public Works"
// covers nearly everything a government runs that isn't an emergency (parks,
// animal control, the airport, elections, libraries), and "Interop" covers
// patches and special events. So each talkgroup is scored:
//
//   - its Tag: 5 for a specific one ("Fire-Tac"), 2–3 for a catch-all;
//   - a word in its Alpha Tag or Description: 4, so it beats a catch-all
//     tag but not a specific one;
//   - a word in its Category: 3 (a department has all kinds of talkgroups);
//   - and a few small, specific types win over the tags that hide them:
//     animal control filed under Law Tac, a jail channel under Law Tac, a
//     school bus under Transportation, airport operations under Public Works,
//     an event pool under Interop (+9, from the Alpha Tag or Description:
//     enough to beat a specific tag with the department's words beside it).
//
// The highest score wins; ties go to the type earlier in PRECEDENCE: the
// specific before the general, so "Fire Police" is fire and "EMS to Mercy
// Hospital" a hospital.
//
// Words are matched whole, also with letters and digits split apart
// ("538DPW" → "538 DPW", "TAC1" → "TAC 1") and camel case split
// ("TrainOpsBlue" → "Train Ops Blue"), since alpha tags squeeze words
// together. Function words (TAC, OPS, MAIN, DISP, ADMIN…) decide nothing on
// their own: they mean whatever the Tag or Category says.
//
// The rules came from 40,415 talkgroups on 48 RadioReference systems
// (statewide, county, city, transit, airport and school systems); the tests
// in test/ hold the cases that taught them.
//
// Pure: no DOM, so it runs in Node for the tests.

/** The types, in the order the settings list them. */
export const TYPES = [
  "fire",
  "ems",
  "police",
  "hospital",
  "emergency",
  "transit",
  "schools",
  "airport",
  "utilities",
  "publicworks",
  "animal",
  "parks",
  "corrections",
  "security",
  "military",
  "federal",
  "government",
  "events",
  "other",
];

/** Which wins a tie. */
const PRECEDENCE = [
  "animal",
  "corrections",
  "hospital",
  "fire",
  "ems",
  "federal",
  "military",
  "police",
  "schools",
  "airport",
  "transit",
  "utilities",
  "parks",
  "events",
  "emergency",
  "security",
  "government",
  "publicworks",
  "other",
];

export const TYPE_NAMES = {
  fire: "Fire",
  ems: "EMS",
  police: "Police",
  hospital: "Hospitals & health",
  emergency: "Emergency management & interop",
  transit: "Transit",
  schools: "Schools",
  airport: "Airport",
  utilities: "Utilities",
  publicworks: "Public works",
  animal: "Animal control",
  parks: "Parks",
  corrections: "Corrections",
  security: "Security",
  military: "Military",
  federal: "Federal",
  government: "City government",
  events: "Events",
  other: "Other",
};

// RadioReference's Tags, as they're exported: only Fire and EMS are
// hyphenated ("Fire-Tac", but "Law Tac"), and the Multi ones. A few
// spellings from hand-made files too. [type, weight]
const TAGS = {
  "law dispatch": ["police", 5],
  "law tac": ["police", 5],
  "law talk": ["police", 5],
  "fire dispatch": ["fire", 5],
  "fire-tac": ["fire", 5],
  "fire tac": ["fire", 5],
  "fire-talk": ["fire", 5],
  "fire talk": ["fire", 5],
  "ems dispatch": ["ems", 5],
  "ems-tac": ["ems", 5],
  "ems tac": ["ems", 5],
  "ems-talk": ["ems", 5],
  "ems talk": ["ems", 5],
  hospital: ["hospital", 5],
  corrections: ["corrections", 5],
  schools: ["schools", 5],
  transportation: ["transit", 4],
  railroad: ["transit", 4],
  utilities: ["utilities", 5],
  military: ["military", 5],
  aircraft: ["airport", 5],
  federal: ["federal", 5],
  "public works": ["publicworks", 3],
  "emergency ops": ["emergency", 3],
  interop: ["emergency", 3],
  "multi-dispatch": ["emergency", 2],
  "multi-tac": ["emergency", 2],
  "multi-talk": ["emergency", 2],
  security: ["security", 3],
  business: ["other", 1],
  media: ["events", 2],
  ham: ["other", 2],
  data: ["other", 5],
  deprecated: ["other", 5],
  other: ["other", 0],
};

// The tags a type's words (in the Alpha Tag or Description) win over ("":
// no tag, where a jail channel would otherwise go to the sheriff's group).
const LAW = ["law dispatch", "law tac", "law talk"];
const CATCHALL = ["public works", "interop", "emergency ops", "multi-dispatch", "multi-tac", "multi-talk", "security", "business", "other"];
const BEATS = {
  animal: ["", ...LAW, ...CATCHALL],
  corrections: ["", ...LAW, ...CATCHALL],
  // Not security: "School Police" on a Security tag is police.
  schools: ["transportation", "public works", "emergency ops", "business", "other"],
  airport: ["transportation", ...CATCHALL],
  events: CATCHALL,
  hospital: ["ems dispatch"],
};

// Words, by type. Each is tried against the Alpha Tag and Description, and
// against the Category. Patterns without the i flag are case-sensitive: short
// abbreviations that are only abbreviations in capitals.
const WORDS = {
  fire: [
    /\bfire(s|fighters?|ground)?\b/i,
    /\b[A-Z]{0,5}FD(NY)?\b/,
    /\bV?FD\b/,
    /\b[A-Z]{0,4}FR\b(?!\s*(\d|response))/,
    /\bF[-\s]?G(RD)?\s?\d/i,
    /\bF[-\s]?TAC\b/i,
    /\bengine\b|\bENG\s?\d/i,
    /\bladder\b|\bTRK\s?\d/i,
    /\bbattalion\b|\bBC\s?\d|\bBATT\s?\d/i,
    /\bhaz[-\s]?mat\b|\bHZM\b/i,
    /\barson\b/i,
    /\bfire\s*marshall?s?\b/i,
    /\bwildland\b|\bbrush\b/i,
    /\bARFF\b/,
    /\bfirst\s*responders?\b/i,
    /\btone[-\s]?outs?\b/i,
  ],
  ems: [
    /\b[A-Z]{0,5}EMS\b/,
    /\bems\b/i,
    /\bmedics?\b|\bparamedic/i,
    /\bambulance\b|\bAMB\s?\d*\b/i,
    /\bAMR\b/,
    /\b(ALS|BLS|EMT|MCI)\b/,
    /\btriage\b/i,
    /\bmed\s?\d+\b/i,
    /\bmed(ical)?\s*control\b/i,
    /\brescue\s*squad\b/i,
    /\bmedevac\b|\bair\s*med\b|\blife\s?(flight|net|star|line)\b/i,
  ],
  police: [
    /\bpolice\b/i,
    /\b[A-Z]{0,5}PD\b/,
    /\b(?!XSO)[A-Z]{0,4}SO\b/,
    /\bsheriff/i,
    /\b(SHF|SHRF|LASD|CHP|DPS)\b/,
    /\bdeput(y|ies)\b/i,
    /\bconstables?\b|\bmarshals?\b/i,
    /\btroop(er)?s?\b|\b(state|highway)\s*patrol\b/i,
    /\blaw\b/i,
    /\bpatrol\b/i,
    /\b(SWAT|SRT|CID|HIDTA)\b/,
    /\bK[-\s]?9\b/i,
    /\bnarc(otics)?\b/i,
    /\bdetectives?\b|\binvestigat/i,
    /\bvice\b|\bgangs?\b|\bwarrants?\b|\bfugitive/i,
    /\binternal\s*affairs\b/i,
    /\bprecinct\b|\b\d(st|nd|rd|th)\s*district\b/i,
  ],
  hospital: [
    /\bhospitals?\b|\bHOSP\b|\bHSP\b/i,
    /\bmedical\s*(center|ctr|coord\w*)\b|\bmed\s*ctr\b/i,
    /\bMEDCOM\b|\bHEAR\b/,
    /\bemergency\s*room\b/i,
    /\bhealth\s*(system|care|dept|department)?\b/i,
    /\bclinic\b|\btrauma\b|\bpoison\b/i,
    /\bmedical\s*examiner\b|\bcoroner\b|\b(OCME|DOH)\b/i,
    /\bbehavioral\b|\bpsych/i,
  ],
  emergency: [
    /\bemerg(ency)?\s*(mgmt|management|ops|operations|services)\b/i,
    /\b(EOC|OEM|OES|CERT|FEMA|TDEM|PEMA)\b/,
    /\b[A-Z]{0,4}EMA\b/,
    /\bhomeland\b/i,
    /\bmutual\s*aid\b|\bMAF?\s?\d\b/i,
    /\binterop\w*/i,
    /\b(unified|incident)\s*command\b|\bUCC\b|\bICS\b/i,
    /\b(ICALL|ITAC|IFIRE|ILAW|UCALL|UTAC|VCALL|VTAC)\s?\d*\b/i,
    /\b[78]\s?(CALL|TAC)\s?\d*\b/i,
    /\bNPSPAC\b/i,
    /\b(county|state|city|region)wide\b|\bregional\b/i,
    /\bdisaster\b|\bskywarn\b|\bsiren\b|\bstorm\s*spotter/i,
    /\bcommand\s*(post|staff)\b/i,
    /\bpatch(es)?\b/i,
    /\bcoord(ination)?\b/i,
    /\b(U?SAR)\b|\bsearch\s*(and|&)\s*rescue\b/i,
    /\bred\s*cross\b/i,
  ],
  transit: [
    /\btransit\b/i,
    /\bbus(es)?\b/i,
    /\brail(road|way)?\b|\btrains?\b|\btrack\b|\bLRT\b/i,
    /\bsubway\b|\bstreetcar\b|\btrolley\b|\blight\s*rail\b|\btram\b/i,
    /\bparatransit\b|\bdial[-\s]?a[-\s]?ride\b|\baccess[-\s]?a[-\s]?ride\b|\bmobility\b|\bcare\s?van\b/i,
    /\b(CTA|WMATA|MARTA|BART|SEPTA|RTD|TriMet|TRIMET|DART|VTA|MBTA|NJT|LIRR|CATS|RTA|GCRTA|COTA|CATA|GRTC|TTC|Muni)\b/,
    /\bferry\b/i,
    /\b(rail|bus|train)\s*yard\b|\byard\s*\d\b/i,
  ],
  schools: [
    /\bschools?\b|\bSCHL?\b/i,
    /\bBOE\b|\bboard\s*of\s*ed/i,
    /\b[A-Z]{0,6}(ISD|USD)\b/,
    /\bpupil\b|\bstudent\b/i,
    /\buniversity\b|\bUNIV\b|\bcollege\b|\bcampus\b/i,
  ],
  airport: [/\bairports?\b|\bAIRPT\b|\bARPT\b/i, /\baviation\b/i, /\bair\s*(ops|side|field)\b|\bairside\b|\bairfield\b/i, /\brunways?\b|\btaxiway\b|\bde-?icers?\b/i, /\bterminal\s*ops\b/i],
  utilities: [
    /\bwater\b(?!\s*(rescue|patrol|craft))/i,
    /\bWTR\b|\bH2O\b/,
    /\bsew(er|age)\w*\b|\bwastewater\b|\bWWTP?\b|\bWTP\b|\bstorm\s*water\b|\bstormwater\b/i,
    /\butil(ity|ities)?\b/i,
    /\belectric\w*\b|\bpower\b|\bPWR\b|\benergy\b|\bENRGY\b|\bcity\s*light\b/i,
    /\bgas\b(?!\s*station)|\bLNG\b/i,
    /\b(WASA|PUD|MUD|DPU|DWP|PUC)\b/,
    /\breservoir\b/i,
  ],
  publicworks: [
    /\bpublic\s*works\b|\bworks\b/i,
    /\b(DPW|PW)\b/,
    /\b[A-Z]{0,5}DOT\b/,
    /\bstreets?\b|\broads?\b|\bhighways?\b|\bHWY\b/i,
    /\btraffic\b(?!\s*(enf|unit|police|squad|stop))/i,
    /\bsignals?\b|\bsigns\b/i,
    /\bsnow\b|\bplows?\b|\bsalt\b/i,
    /\bsanitation\b|\bsanit\b|\btrash\b|\brefuse\b|\bsolid\s*waste\b|\bSOLIDWST\b|\bgarbage\b|\brecycl\w*|\blandfill\b/i,
    /\bfleet\b|\bmotor\s*pool\b|\bmotorpool\b|\bgarage\b/i,
    /\bmaint(enance)?\b|\bMNT\b/i,
    /\bfacilit(y|ies)\b/i,
    /\bparking\b/i,
    /\bforestry\b|\btree\s*(crew|trim)/i,
    /\bengineering\b|\bENGR\b/i,
    /\bbridges?\b|\bflaggers?\b|\bmosquito\b|\bconstruction\b/i,
  ],
  animal: [/\banimals?\b|\bANML\b|\bANICTL\b|\bACO\b/i, /\bhumane\b/i, /\bdog\s*(warden|catcher)\b|\bDOGWRD\b/i],
  parks: [
    /\bparks\b|\bPRKS\b|\bP\s?&\s?R\b/i,
    /\bpark\s*(and|&)\s*rec|\b(state|county|city)\s*park\b|\bpark\s*(rangers?|maint\w*|dept)\b/i,
    /\brecreation\b/i,
    /\bgolf\b|\bzoo\b|\baquarium\b|\bbotanic\w*/i,
    /\blifeguards?\b|\bLFGD\b|\bbeach\b/i,
    /\brangers?\b|\bnatural\s*resources\b|\bconservation\b/i,
  ],
  corrections: [
    /\bcorrections?\b|\bcorrectional\b/i,
    /\bjail\w*\b|\bdetention\b|\bprisons?\b|\binmates?\b/i,
    /\b(DOC|CDOC|CDCR|DYS|ADC|JJC|DYRS)\b/,
    /\bjuvenile\b|\byouth\s*(rehab\w*|services|detention)/i,
    /\bprobation\b|\bparole\b/i,
  ],
  security: [/\bsecurity\b|\bsecur\w*\b/i, /\bprotective\b/i, /\bcampus\s*safety\b|\bloss\s*prevention\b/i, /\bsecurity\s*guards?\b/i],
  military: [
    /\bnational\s*guard\b/i,
    /\b(ARNG|ANG|USMC|USAF|NG)\b|\b[A-Z]{2}NG\b/,
    /\barmy\b|\bnavy\b|\bnaval\b|\bair\s*force\b|\bmarines?\b|\bcoast\s*guard\b|\bUSCG\b/i,
    /\bAFB\b|\bfort\b|\bmilitary\b/i,
  ],
  federal: [/\bfederal\b|\bFED\b/i, /\b(FBI|ATF|DEA|USSS|CBP|ICE|HSI|FPS|USMS|USPP|USPIS|NPS|BLM|USFS|FWS|TSA|FAA|NASA)\b/, /\bsecret\s*service\b/i, /\bborder\s*patrol\b/i, /\bpostal\b/i, /\bus\s*capitol\b|\bUSCP\b/i],
  government: [
    /\bcity\s*hall\b|\bcity\s*manager\b|\bcounty\s*(admin\w*|manager|government)\b/i,
    /\bmayor\b|\bcouncil\b|\bcommissioners?\b|\bBOCC\b/i,
    /\bexec(utive)?\b|\bofficials?\b/i,
    /\badmin(istration)?\b/i,
    /\belections?\b|\bclerk\b|\bassessor\b|\btreasur\w*|\bfinance\b|\brevenue\b/i,
    /\bbuilding\s*(insp\w*|dept)|\binspect(or|ion)s?\b|\bcode\s*(enf\w*|compliance)\b|\bplanning\b|\bzoning\b|\bpermits\b/i,
    /\blibrar(y|ies)\b/i,
    /\bhuman\s*services\b|\bsocial\s*services\b|\bhousing\b/i,
    /\bcourts?\b|\bjudicial\b/i,
    /\btaxi(cab)?\b/i,
    /\blocal\s*government\b/i,
  ],
  events: [/\bspecial\s*events?\b|\bSPEV\w*|\bSP\s?EV\b|\bEVNTS?\b/i, /\bevents?\b/i, /\bstadium\b|\barena\b|\bballpark\b|\bconvention\b|\bfairgrounds?\b|\bcivic\s*center\b/i, /\bparade\b|\bfestival\b|\bconcert\b|\bmarathon\b|\brodeo\b/i, /\binaug\w*/i],
  other: [/\bdata\b/i, /\btest(ing)?\b/i, /\bspare\b/i, /\bdeprecated\b/i, /\bunknown\b/i],
};

// Talkgroups that are rarely worth a street, whatever their type: off
// unless turned on.
const OFF = [/\bdata\b/i, /\btest(ing)?\b/i, /\bdeprecated\b/i, /\bspare\b/i, /\bunknown\b/i, /\b(MDC|MDT|FRAP|OTAP|OTAR|MOSCAD|SCADA|AVL|telemetry)\b/i];

// What kind of thing within its type, for the pictures: a train or a bus,
// water or electricity, a plow in winter.
const FLAVORS = [
  ["transit", "rail", /\brail\w*\b|\btrains?\b|\bsubway\b|\bmetro\s*ops\b|\btrack\b|\byard\b|\bstreetcar\b|\btrolley\b|\blight\s*rail\b|\btram\b|\bLRT\b/i],
  ["transit", "bus", /\bbus(es)?\b|\bparatransit\b|\bdial[-\s]?a[-\s]?ride\b|\bmobility\b|\bcare\s?van\b/i],
  ["transit", "ferry", /\bferry\b/i],
  ["publicworks", "rail", /\brail\b|\btrack\b|\btrains?\b/i],
  ["publicworks", "sanitation", /\bsanitation\b|\bsanit\b|\btrash\b|\brefuse\b|\bsolid\s*waste\b|\bSOLIDWST\b|\bgarbage\b|\brecycl/i],
  ["publicworks", "snow", /\bsnow\b|\bplows?\b|\bsalt\b/i],
  ["publicworks", "traffic", /\btraffic\b|\bsignals?\b|\bparking\b/i],
  ["utilities", "power", /\belectric\w*\b|\bpower\b|\bPWR\b|\benergy\b|\bENRGY\b|\bcity\s*light\b|\bgas\b|\bLNG\b/i],
  ["utilities", "water", /\bwater\b|\bsew(er|age)\b|\bwastewater\b|\bWWTP?\b|\bWASA\b/i],
  ["schools", "university", /\buniversity\b|\bUNIV\b|\bcollege\b|\bcampus\b/i],
  ["police", "secret", /\bsec(ure)?\b|\bnarc|\bvice\b|\bintel/i],
];

/** Words squeezed together, pulled apart: "538DPW" → "538 DPW", "TrainOps" → "Train Ops". */
export const unsqueeze = (s) =>
  s
    .replace(/([0-9])([A-Za-z])/g, "$1 $2")
    .replace(/([A-Za-z])([0-9])/g, "$1 $2")
    .replace(/([a-z])([A-Z])/g, "$1 $2");

const findIn = (patterns, text, split) => {
  for (const re of patterns) {
    const m = re.exec(text) ?? re.exec(split);
    if (m) return m[0].trim();
  }
  return null;
};

/**
 * A talkgroup ({ alphaTag, description, tag, group }) → { type, flavor,
 * enabled, why }: `why` says what decided it, for the settings page.
 */
export function classify(tg) {
  const tagRaw = (tg.tag ?? "").trim();
  const tag = tagRaw.toLowerCase();
  const text = `${tg.alphaTag ?? ""} | ${tg.description ?? ""}`;
  const textSplit = unsqueeze(text);
  const cat = (tg.group ?? "").trim();
  const catSplit = unsqueeze(cat);
  const score = Object.fromEntries(TYPES.map((t) => [t, 0]));
  const why = Object.fromEntries(TYPES.map((t) => [t, []]));

  const t = TAGS[tag];
  if (t && t[1]) {
    score[t[0]] += t[1];
    why[t[0]].push(`tag “${tagRaw}”`);
  }
  for (const type of TYPES) {
    const inText = findIn(WORDS[type], text, textSplit);
    if (inText) {
      score[type] += 4;
      if (BEATS[type]?.includes(tag)) score[type] += 9;
      why[type].push(`“${inText}”`);
    }
    const inCat = cat && findIn(WORDS[type], cat, catSplit);
    if (inCat) {
      score[type] += 3;
      why[type].push(`group “${cat}”`);
    }
  }

  let best = null;
  for (const type of PRECEDENCE) if (best === null || score[type] > score[best]) best = type;
  if (score[best] <= 0) best = "other";

  const all = `${text} | ${textSplit} | ${cat}`;
  const flavor = FLAVORS.find(([type, , re]) => type === best && re.test(all))?.[1] ?? null;
  const enabled = !(tag === "data" || tag === "deprecated" || OFF.some((re) => re.test(text) || re.test(textSplit)));
  return { type: best, flavor, enabled, why: why[best].join(", ") || "nothing matched" };
}

/**
 * Is a system's talkgroup file good enough to build a city from? Most of its
 * talkgroups should land somewhere other than "other".
 */
export function wellDefined(classified) {
  if (classified.length < 4) return false;
  const known = classified.filter((c) => c.type !== "other").length;
  return known / classified.length >= 0.5;
}
