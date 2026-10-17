// Talkgroups from real systems, and what they should be. Most came from a
// survey of 40,415 talkgroups on 48 RadioReference systems: each is a case
// that taught the classifier something (see classify.js).

import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, unsqueeze, wellDefined } from "../interface/js/classify.js";

// [alpha tag, description, tag, category] → type (and flavor)
const CASES = [
  // Tags decide the big services.
  ["CPD 800 Zone 9", "Zone 9: Districts 5/22", "Law Dispatch", "Chicago Police Department", "police"],
  ["NYPD CW 3", "Citywide 3", "Law Dispatch", "Citywide", "police"],
  ["01 DISP", "Fire Dispatch", "Fire Dispatch", "Fire/EMS Copy", "fire"],
  ["011 EMS 1", "EMS 1 (East)", "EMS-Tac", "Fire/EMS Copy", "ems"],
  ["PFD Cent Medic", "Central EMS Dispatch (Central Medic)", "EMS Dispatch", "Fire Department", "ems"],
  ["SFD Medic 1", "Medic One", "Fire-Tac", "Seattle Fire", "fire"],
  ["HFD Med 3", "Ch. AC3 Med 3 (hospital consultation)", "Hospital", "Houston - Fire/EMS - Hospital", "hospital"],
  ["FCFD 49A MEDCOM", "49A RHCC MEDCOM", "Hospital", "Fire", "hospital"],
  ["0H3 NOTIFY", "Notify", "Hospital", "Hospitals Copy", "hospital"],
  // Small types win over the tags that hide them.
  ["FCPD AC", "Animal Control", "Law Tac", "Police", "animal"],
  ["ChstPD AC", "Animal Control", "Public Works", "Chesterfield County Police", "animal"],
  ["25JAIL1", "Genesee County Sheriff's Department: Corrections Channel 1", "Law Tac", "Genesee County (25) Law Enforcement", "corrections"],
  ["27IASBUS", "Ironwood Area Schools Bus", "Transportation", "Gogebic County (27)", "schools"],
  ["ABIA AIROPS", "Airport Airside Operations", "Public Works", "Austin Airport", "airport"],
  ["HC Events 2", "Event Special Events Ch 2", "Emergency Ops", "Hillsborough County Special Events", "events"],
  ["39PARKS", "County Parks Dept.", "Public Works", "Kalamazoo County (39) County Government", "parks"],
  ["DC Parks/Rec2203", "Parks and Recreation", "Public Works", "Services Copy", "parks"],
  ["AusLibrary 1", "Libraries 1", "Public Works", "Austin Services", "government"],
  ["MP ELECT", "Election Polling Comms", "Public Works", "Hennepin County - Minneapolis", "government"],
  ["RIZ-11 Exec1", "RIZ-11 Executive 1 (Senior City Officials)", "Public Works", "", "government"],
  ["Health 2153", "Department of Health", "Public Works", "Services Copy", "hospital"],
  ["DC DHS 2143", "Department of Human Services", "Public Works", "Services Copy", "government"],
  // Words squeezed into alpha tags.
  ["538DPW", "DPW", "Public Works", "Wayne County (82) Livonia City Services", "publicworks"],
  ["SOLIDWST DIS", "Solid Waste - Dispatch", "Public Works", "Austin Services", "publicworks", "sanitation"],
  // Traps.
  ["TPD A-C2C", "Sector A Car-to-Car", "Law Talk", "Tampa Police Department", "police"], // AC isn't animal control
  ["82LPPD1", "Lincoln Park Police 1", "Law Dispatch", "Wayne County (82) Lincoln Park", "police"], // Park is a city
  ["39MFPAG", "Kalamazoo Metro Fire Page", "Fire Dispatch", "Kalamazoo County (39) Fire", "fire"], // not zoo, not metro
  ["AK BOE FIRSTONE", "Board of Education - Firestone", "Schools", "Akron (Summit County)", "schools"], // not fire
  ["Bastrop ISD PD", "Bastrop ISD Police", "Law Dispatch", "Bastrop County - Bastrop", "police"], // school police
  ["DC Sch PD 1", "School Police 1", "Security", "Services Copy", "police"],
  ["Metro PD Pri", "Metro Transit Police - Primary", "Law Dispatch", "Sound Transit", "police"],
  ["MTPD-1", "MTPD-1", "Law Dispatch", "Police", "police"],
  ["TSA 1", "Transportation Security Administration 1", "Federal", "Federal Government - Law Enforcement", "federal"],
  ["ECEN FP 1", "ECEN Fire Police 1", "Fire-Talk", "East Central Emergency Network", "fire"],
  ["FireMarshal", "Nassau County Fire Marshals", "Fire-Tac", "Countywide Fire", "fire"],
  ["XSO-25", "Statewide Interop", "Interop", "Franklin County Common", "emergency"], // XSO isn't a sheriff
  ["RC POOL 12", "Rice Pool 12", "Multi-Tac", "Rice County", "emergency"], // not a swimming pool
  ["MPD WMATA 1", "WMATA Patch 1", "Interop", "Police Copy", "police"],
  // Transit, by flavor.
  ["Metro Ops 1", "Ops 1 - Red Line", "Transportation", "Rail Operations", "transit", "rail"],
  ["TrainOpsBlue", "Train Operators - Blue/Silver Lines", "Transportation", "Rail Operations", "transit", "rail"],
  ["MetBus Disp1", "Bus Dispatch 1", "Transportation", "Bus", "transit", "bus"],
  ["DC Para 2229", "Paratransit", "Transportation", "Services Copy", "transit", "bus"],
  ["GRTC CareVan 1", "CareVan 1", "Transportation", "All", "transit", "bus"],
  // Utilities, by flavor.
  ["A ENRGY DISP", "Austin Energy Electric Dispatch", "Utilities", "Austin Energy", "utilities", "power"],
  ["DC WASA 1", "Water and Sewer Authority 1", "Utilities", "Services Copy", "utilities", "water"],
  // With no tag, keywords alone.
  ["SVPD Disp", "Police Dispatch", "", "", "police"],
  ["Bell Wtr Dsp", "Water - Dispatch", "", "", "utilities"],
  ["10JAIL", "County Jail", "", "Benzie County (10) Law Enforcement", "corrections"],
  ["Gilbert FR", "Gilbert 1st Responders", "", "", "fire"],
  ["MntezmaCo SAR", "Search and Rescue", "", "", "emergency"],
  ["Some Channel", "Something", "", "", "other"],
];

for (const [alphaTag, description, tag, group, type, flavor] of CASES)
  test(`${alphaTag} → ${type}${flavor ? `/${flavor}` : ""}`, () => {
    const c = classify({ alphaTag, description, tag, group });
    assert.equal(c.type, type, `${alphaTag} | ${description} | ${tag} | ${group}: ${c.why}`);
    if (flavor) assert.equal(c.flavor, flavor);
  });

test("data, test and spare talkgroups start off", () => {
  assert.equal(classify({ alphaTag: "RFD FRAP", description: "FRAP Activation", tag: "Data", group: "Richmond Fire" }).enabled, false);
  assert.equal(classify({ alphaTag: "Radio Test 33248", description: "Radio Testing", tag: "Public Works", group: "Other" }).enabled, false);
  assert.equal(classify({ alphaTag: "RIZ-14 Spare1", description: "RIZ-14 Spare 1", tag: "Interop", group: "" }).enabled, false);
  assert.equal(classify({ alphaTag: "01 DISP", description: "Fire Dispatch", tag: "Fire Dispatch", group: "" }).enabled, true);
});

test("unsqueeze pulls words apart", () => {
  assert.equal(unsqueeze("538DPW"), "538 DPW");
  assert.equal(unsqueeze("TrainOpsBlue"), "Train Ops Blue");
  assert.equal(unsqueeze("TAC1"), "TAC 1");
});

test("a file of tagged talkgroups is well defined; one of bare numbers isn't", () => {
  assert.equal(wellDefined(CASES.map(([alphaTag, description, tag, group]) => classify({ alphaTag, description, tag, group }))), true);
  assert.equal(wellDefined(["1", "2", "3", "4", "5"].map((n) => classify({ alphaTag: `TG ${n}`, description: "", tag: "", group: "" }))), false);
});
