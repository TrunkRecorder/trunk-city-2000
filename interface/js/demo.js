// A pretend recorder, for ?demo: four made-up systems with talkgroup files
// like RadioReference's, and calls coming and going on them, the way a busy
// evening sounds (dispatch talks most; a call is often answered, dispatcher
// and unit taking turns). Each talkgroup has its radios, most with names
// (Engine 7, Car 214), some without. It has the parts of TrunkClient this
// interface uses.

const SYSTEMS = [
  {
    shortName: "springfield",
    name: "Springfield County P25",
    type: "p25",
    csv: `Decimal,Hex,Alpha Tag,Mode,Description,Tag,Category
101,65,SFD Disp,D,Fire Dispatch,Fire Dispatch,Springfield Fire/EMS
102,66,SFD FG 1,D,Fireground 1,Fire-Tac,Springfield Fire/EMS
103,67,SFD FG 2,D,Fireground 2,Fire-Tac,Springfield Fire/EMS
104,68,SFD FG 3,D,Fireground 3,Fire-Tac,Springfield Fire/EMS
105,69,SFD Cmd,D,Command,Fire-Talk,Springfield Fire/EMS
106,6a,SFD Admin,D,Administration,Fire-Talk,Springfield Fire/EMS
110,6e,SFD EMS 1,D,EMS Operations 1,EMS-Tac,Springfield Fire/EMS
111,6f,SFD EMS 2,D,EMS Operations 2,EMS-Tac,Springfield Fire/EMS
201,c9,SPD Disp 1,D,Police Dispatch North,Law Dispatch,Springfield Police
202,ca,SPD Disp 2,D,Police Dispatch South,Law Dispatch,Springfield Police
203,cb,SPD Tac 1,DE,Tactical 1,Law Tac,Springfield Police
204,cc,SPD Tac 2,DE,Tactical 2,Law Tac,Springfield Police
205,cd,SPD CID,DE,Investigations,Law Tac,Springfield Police
206,ce,SPD Traffic,D,Traffic Unit,Law Tac,Springfield Police
207,cf,SPD K9,DE,K-9 Unit,Law Tac,Springfield Police
301,12d,SCSO Disp,D,Sheriff Dispatch,Law Dispatch,Springfield County Sheriff
302,12e,SCSO Jail,D,Detention Center,Corrections,Springfield County Sheriff
401,191,Mercy Hosp,D,Mercy Hospital ER,Hospital,Hospitals
402,192,StAgnes Hosp,D,St. Agnes Medical Center,Hospital,Hospitals
403,193,HEAR,D,Hospital Emergency Admin Radio,Hospital,Hospitals
501,1f5,DPW Streets,D,Streets Division,Public Works,Springfield Public Works
502,1f6,DPW Sanit,D,Sanitation,Public Works,Springfield Public Works
503,1f7,DPW Snow,D,Snow Removal,Public Works,Springfield Public Works
504,1f8,Traffic Sig,D,Traffic Signals,Public Works,Springfield Public Works
511,1ff,SPU Water,D,Water Department,Utilities,Springfield Public Utilities
512,200,SPU Sewer,D,Wastewater,Utilities,Springfield Public Utilities
513,201,SPU Electric,D,Electric Dispatch,Utilities,Springfield Public Utilities
601,259,SPS Buses,D,School Buses,Schools,Springfield Public Schools
602,25a,SPS Security,D,School Security,Security,Springfield Public Schools
701,2bd,Animal Ctl,D,Animal Control,Public Works,County Services
702,2be,Parks & Rec,D,Parks and Recreation,Public Works,County Services
703,2bf,Code Enf,D,Code Enforcement,Public Works,County Services
704,2c0,Mayor's Ofc,D,Mayor's Office,Public Works,County Services
801,321,EOC,D,Emergency Operations Center,Emergency Ops,Emergency Management
802,322,County MA 1,D,Countywide Mutual Aid 1,Interop,Interop
803,323,SPEV 1,D,Special Events 1,Interop,Interop
804,324,Stadium Ops,D,Kilohertz Stadium Operations,Business,Events
901,385,SPI Airside,D,Airport Airside Operations,Public Works,Springfield Airport
902,386,SPI ARFF,D,Airport Fire Rescue,Fire-Tac,Springfield Airport
999,3e7,Data 999,D,Mobile Data,Data,System`,
  },
  {
    shortName: "metro",
    name: "Metro Transit SmartNet",
    type: "smartnet",
    csv: `Decimal,Hex,Mode,Alpha Tag,Description,Tag,Category,Priority
32784,8010,D,Rail Ops 1,Ops 1 - Red Line,Transportation,Rail Operations,1
32816,8030,D,Rail Ops 2,Ops 2 - Blue Line,Transportation,Rail Operations,1
32848,8050,D,Rail Ops 3,Ops 3 - Green Line,Transportation,Rail Operations,1
33648,8370,D,Train Ops,Train Operators,Transportation,Rail Operations,1
35200,8980,D,North Yard,North Yard 1,Transportation,Rail Yard,1
35232,89a0,D,South Yard,South Yard 1,Transportation,Rail Yard,1
36000,8ca0,D,Bus Disp 1,Bus Dispatch 1,Transportation,Bus,1
36032,8cc0,D,Bus Disp 2,Bus Dispatch 2,Transportation,Bus,1
36064,8ce0,D,Bus Disp 3,Bus Dispatch 3,Transportation,Bus,1
36096,8d00,D,Bus Supv,Bus Supervisors,Transportation,Bus,1
36128,8d20,D,Paratransit,Paratransit Dispatch,Transportation,Bus,1
40000,9c40,D,Track Mnt,Track and Structures,Public Works,Rail Maintenance,1
40032,9c60,D,Power Tech,Traction Power,Public Works,Rail Maintenance,1
49168,c010,D,MTPD 1,Transit Police Dispatch,Law Dispatch,Police,1
49200,c030,DE,MTPD Tac,Transit Police Tac,Law Tac,Police,1
33248,81e0,D,Radio Test,Radio Testing,Public Works,Other,1`,
  },
  {
    shortName: "shelbyville",
    name: "Shelbyville City",
    type: "p25",
    csv: `Decimal,Hex,Alpha Tag,Mode,Description,Tag,Category
1001,3e9,SVFD Disp,D,Fire Dispatch,Fire Dispatch,Fire
1002,3ea,SVFD Ops,D,Fire Operations,Fire-Tac,Fire
1003,3eb,SV Medic,D,Medic Units,EMS Dispatch,Fire
1101,44d,SVPD Disp,D,Police Dispatch,Law Dispatch,Police
1102,44e,SVPD Tac,DE,Police Tactical,Law Tac,Police
1103,44f,SVPD Ops,D,Police Operations,Law Talk,Police
1201,4b1,SV DPW,D,Public Works,Public Works,City Services
1202,4b2,SV Trash,D,Solid Waste,Public Works,City Services
1203,4b3,SV Light,D,City Light Electric,Utilities,City Services
1204,4b4,SV Water,D,Water and Sewer,Utilities,City Services
1205,4b5,SV Animal,D,Animal Services,Public Works,City Services
1301,515,SV Schools,D,Shelbyville ISD Transportation,Schools,Schools`,
  },
  {
    shortName: "harbor",
    name: "Harbor County",
    type: "p25",
    csv: `Decimal,Hex,Alpha Tag,Mode,Description,Tag,Category
2001,7d1,HCFD Disp,D,Fire Dispatch,Fire Dispatch,Harbor County Fire
2002,7d2,HCFD Tac 1,D,Fire Tac 1,Fire-Tac,Harbor County Fire
2003,7d3,HCFD Marine,D,Fireboat,Fire-Tac,Harbor County Fire
2101,835,HCSO Disp,D,Sheriff Dispatch,Law Dispatch,Harbor County Sheriff
2102,836,HCSO Tac,DE,Sheriff Tac,Law Tac,Harbor County Sheriff
2103,837,HCSO Marine,D,Marine Patrol,Law Tac,Harbor County Sheriff
2201,899,HC Jail 1,D,County Jail,Corrections,Corrections
2202,89a,HC Jail 2,D,Jail Transport,Corrections,Corrections
2301,8fd,USCG Sector,D,Coast Guard Sector,Military,Federal/Military
2302,8fe,HC NG,D,National Guard Armory,Military,Federal/Military
2303,8ff,FBI HC,DE,FBI Field Office,Federal,Federal/Military
2401,961,Ferry Ops,D,Ferry Operations,Transportation,Ferry
2402,962,HC Bus,D,County Bus,Transportation,Transit
2501,9c5,HC Hosp,D,Harbor General Hospital,Hospital,Hospitals
2601,a29,HC Roads,D,Roads and Bridges,Public Works,County Services
2602,a2a,HC Parks,D,County Parks and Beaches,Public Works,County Services
2603,a2b,HC Lifeguard,D,Lifeguards,Multi-Tac,County Services`,
  },
];

export class DemoClient {
  constructor(parseTalkgroups) {
    this.parse = parseTalkgroups;
    this.connected = true;
    this.exited = false;
    this.demo = true;
    this.version = "demo";
    this.phase = { phase: "running", error: null, ended: false };
    this.config = { systems: SYSTEMS.map(({ csv, ...s }) => ({ ...s, enabled: true, talkgroupsCsv: csv })), conventional: [] };
    this.calls = [];
    this.history = [];
    this.status = { nowS: 0, systems: SYSTEMS.map((s, index) => ({ index, shortName: s.shortName })) };
    this.handlers = new Map();
    this.nextId = 1;
    this.followUps = [];
    this._tg = new Map();
    this.pools = new Map(); // "short:tg" → { dispatch, units }
    this.names = new Map(); // "short:unit" → name
    this.nextUnit = 1001;
    this.start = performance.now();
    setTimeout(() => this.emit("hello", {}), 0);
    setInterval(() => this.tick(), 500);
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }

  emit(type, m) {
    for (const fn of this.handlers.get(type) ?? []) fn(m);
    for (const fn of this.handlers.get("change") ?? []) fn(this);
  }

  talkgroups(short) {
    if (!this._tg.has(short)) this._tg.set(short, this.parse(this.config.systems.find((s) => s.shortName === short)?.talkgroupsCsv ?? ""));
    return this._tg.get(short);
  }

  unitName(short, unit) {
    return this.names.get(`${short}:${unit}`) ?? "";
  }

  /** A talkgroup's radios: a dispatcher, and units named for what it is. */
  pool(short, tg) {
    const key = `${short}:${tg.talkgroup}`;
    let p = this.pools.get(key);
    if (p) return p;
    const text = `${tg.alphaTag} ${tg.description} ${tg.tag}`;
    const kinds = [
      [/fire|\bfd\b|\bfg\b|arff|marine/i, ["Engine", "Engine", "Truck", "Medic", "Battalion"]],
      [/ems|medic/i, ["Medic", "Medic", "Ambulance"]],
      [/\bpd\b|police|sheriff|\bso\b|mtpd|law|k-?9|cid|traffic unit/i, ["Car", "Car", "Unit", "Sgt"]],
      [/school/i, ["School Bus"]],
      [/bus|para/i, ["Bus", "Bus", "Supv"]],
      [/rail|train|yard/i, ["Train"]],
      [/animal/i, ["Animal Ctl"]],
      [/park|lifeguard|beach/i, ["Parks", "Ranger"]],
      [/dpw|street|sanit|trash|snow|roads|signal|track|power|water|sewer|electric|light|waste/i, ["DPW", "Crew", "Truck"]],
      [/jail|corrections/i, ["Transport", "Officer"]],
      [/guard|coast|ng\b/i, ["Guard"]],
    ];
    const names = kinds.find(([re]) => re.test(text))?.[1] ?? null;
    const agency = tg.alphaTag.split(/\s+/)[0];
    const add = (name) => {
      const unit = this.nextUnit++;
      if (name) this.names.set(`${short}:${unit}`, name);
      return unit;
    };
    // One dispatcher for an agency, whichever of its talkgroups it's on.
    this.dispatchers ??= new Map();
    const dk = `${short}:${agency}`;
    if (!this.dispatchers.has(dk)) this.dispatchers.set(dk, add(`${agency} Dispatch`));
    p = { dispatch: this.dispatchers.get(dk), units: [] };
    if (names)
      for (let n = 0; n < 3 + Math.floor(Math.random() * 4); n++) {
        const base = names[Math.floor(Math.random() * names.length)];
        // Most radios have names; some don't.
        p.units.push(add(Math.random() < 0.8 ? `${base} ${base === "Car" || base === "Bus" || base === "Train" ? 100 + Math.floor(Math.random() * 800) : 1 + Math.floor(Math.random() * 30)}` : ""));
      }
    this.pools.set(key, p);
    return p;
  }

  listen() {}
  callUrl() {
    return "";
  }

  tick() {
    const now = (performance.now() - this.start) / 1000;
    this.status.nowS = now;
    // Calls end.
    this.calls = this.calls.filter((c) => c.endS > now);
    // Answers to earlier calls.
    for (const f of this.followUps.splice(0)) {
      if (f.at > now) this.followUps.push(f);
      else this.begin(f.sys, f.tg, now, f.left, f.after);
    }
    // New calls: busier on dispatch.
    SYSTEMS.forEach((s, index) => {
      const tgs = [...this.talkgroups(s.shortName).values()].filter((t) => t.tag !== "Data" && !/test/i.test(t.description));
      const rate = index === 0 ? 0.32 : index === 1 ? 0.22 : 0.14; // calls a tick
      if (Math.random() < rate) {
        const weighted = tgs.flatMap((t) => (/dispatch|disp|ops/i.test(`${t.tag} ${t.alphaTag}`) ? [t, t, t] : [t]));
        const tg = weighted[Math.floor(Math.random() * weighted.length)];
        if (!this.calls.some((c) => c.systemName === s.shortName && c.talkgroup === tg.talkgroup)) this.begin(index, tg, now, 1 + Math.floor(Math.random() * 5));
      }
    });
    this.emit("status", {});
  }

  begin(index, tg, now, left, after = null) {
    const s = SYSTEMS[index];
    if (this.calls.some((c) => c.systemName === s.shortName && c.talkgroup === tg.talkgroup)) return;
    const len = 2 + Math.random() * 8;
    // Dispatcher and units take turns.
    const p = this.pool(s.shortName, tg);
    const unit = p.units.length && (after === p.dispatch || (after == null && Math.random() < 0.4)) ? p.units[Math.floor(Math.random() * p.units.length)] : p.dispatch;
    this.calls.push({
      id: this.nextId++,
      system: index,
      systemName: s.shortName,
      talkgroup: tg.talkgroup,
      alphaTag: tg.alphaTag,
      encrypted: /E/.test(tg.mode),
      emergency: Math.random() < 0.01,
      state: /E/.test(tg.mode) ? "monitoring" : "recording",
      reason: /E/.test(tg.mode) ? "encrypted" : null,
      startS: now,
      endS: now + len,
      sources: [unit],
    });
    // Someone answers.
    if (left > 0 && Math.random() < 0.75) this.followUps.push({ sys: index, tg, left: left - 1, after: unit, at: now + len + 0.5 + Math.random() * 6 });
  }
}
