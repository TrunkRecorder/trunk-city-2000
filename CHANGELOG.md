# Changelog

## [Unreleased]

- For the recorder release after v0.1.15: a system's talkgroup file comes from the recorder on its
  own (`rec.talkgroupFiles`), not inside the config, and the city is rebuilt when it changes. Calls
  and live audio name their system by the recorder's `status.systemNames`.

## [0.3.0]

- The city is in full color again: what's on the radio stands out by its own light instead of the
  rest being faded (fading is still in City Planning, off unless turned on; it's turned off once
  for anyone who had it from 0.2).
- Each service has its color (police blue, fire orange, EMS pink, transit green…), and its radios
  show it: a ring on the ground under every radio's vehicle (faint when heard lately, pulsing
  while it talks), a trail of sparkles while it talks, dots marching along its route to an
  incident, and a stripe down its name bubble.
- A dispatcher's building, when it talks, glows with rays turning over it and radio rings rising.
- A radio talking behind a building shows through it.
- Fewer background cars (at most four, on light), and no background buses.

## [0.2.1]

- Vehicles move smoothly along the roads: each step is the 2-across, 1-down of isometric pixel art,
  where before x and y rounded on frames of their own and sprites jiggled. They round corners
  instead of hopping from one lane to the other.
- Fixed: a radio's name bubble floated over the empty space beyond the map while its vehicle was
  out there, out of sight.

## [0.2.0]

- Every radio on the air is someone in town. The unit talking on a call becomes a vehicle of its
  talkgroup's kind (patrol car, engine, ladder, ambulance, bus, train, plow…), out from its
  talkgroup's building to what the talkgroup is busy with. It glows while it transmits, with its
  name in a bubble, and stays around a couple of minutes after it last talked. Dispatchers are
  their buildings, lit while they talk. Works on encrypted talkgroups: the control channel says
  who's talking.
- What's on the radio stands out: light background traffic, and the city a little quieter (less
  color and light) than the radios, incidents and effects. City Planning has the traffic (none,
  light, busy), the quieting, and labels for radios with no name.
- Fixed: buildings sometimes jumped in front of the ones before them as traffic passed behind.
- Fixed: trains were drawn over the empty space beyond the map's edge before they reached it.
- Everything moves at a gentler pace, and the page draws 30 frames a second, which halves the work.

## [0.1.0]

The first release.

- A pixel-art city for each system, built from its talkgroups: its size from how many there are,
  its buildings from what kinds they are, and a home for every talkgroup.
- Calls set things going in their city, by talkgroup type: fires, rescues, ambulance runs, police
  calls and chases, road crews, trash and plow routes, water main breaks, buses, trains, flights,
  helicopters, convoys, crowds at the stadium. Encrypted talkgroups count, since all that's needed
  is that a talkgroup is on the air.
- Talkgroups sorted by their RadioReference Tag, Category, Alpha Tag and Description, with rules
  drawn from 40,415 talkgroups on 48 systems.
- One city, or four at once.
- City Planning: systems and talkgroups on and off, and what each talkgroup is, kept in the
  browser.
- Headlines, a news ticker and the Trunk City Times.
- Live audio from the cities on screen.
- Full screen (the ⛶ button, or F), with the bars and the pointer out of the way when nothing
  moves, for a wall or a spare monitor.
- Saucers, balloons, a blimp, geese, ducks, a December sleigh, and Bigfoot.
- A demo (`?demo`) with four made-up systems.
