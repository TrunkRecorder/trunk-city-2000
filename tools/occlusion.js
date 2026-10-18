// Checks that buildings hide what's behind them. With the smoke, flyers,
// signs and radios turned off, everything outside the moving vehicles'
// boxes must be what the city looks like with nothing moving, frame after
// frame, as traffic goes behind and in front of buildings. (Within a small
// tolerance: a building drawn again over a car is anti-aliased a shade
// differently at its edges than in its chunk.) Run it in the page, with all
// four demo cities built:
//
//   node tools/shoot.mjs "http://localhost:8099/?demo" "" --wait 16 --eval "$(cat tools/occlusion.js)"
//
// → { city: { frames, framesWithWrongPixels, worstFramePixels } }: wrong
// pixels anywhere means a building drawn out of turn.

(async () => {
  document.getElementById("v4").click();
  await new Promise((r) => setTimeout(r, 1500));
  trunkCity.settings.whimsy = false;
  const TOL = 40;
  const out = {};
  for (const [short, c] of trunkCity.cities) {
    const v = c.view;
    v.setFollow(false);
    v.resize();
    v.zoom = v.z = 2 * v.dpr;
    v.setLook({ traffic: "normal", dim: v.dim });
    v.particles = [];
    v.flyers = [];
    v.incidents = [];
    v.talk.clear();
    v.talkers.clear();
    v.water = [];
    v.stacks = [];
    v.trains = [];
    v.callStart = v.talker = () => {};
    v.opts.whimsy = () => false;
    const update = v.update;
    v.update = function (dt) {
      update.call(this, dt);
      this.particles = [];
      this.rings = [];
    };
    // The chunks in view, all drawn, before starting.
    v.cx = 0;
    v.cy = v.city.N * 8;
    for (let k = 0; k < 40; k++) v.render();
    let bad = 0,
      worst = 0;
    for (let f = 0; f < 120; f++) {
      v.update(0.25);
      v.cx = 0;
      v.cy = v.city.N * 8;
      v.render();
      const w = v.canvas.width,
        h = v.canvas.height;
      const moving = v.ctx.getImageData(0, 0, w, h).data;
      const ents = v.ents;
      v.ents = [];
      v.render();
      const still = v.ctx.getImageData(0, 0, w, h).data;
      v.ents = ents;
      const N = v.city.N;
      const mask = new Uint8Array(w * h);
      const boxes = ents.filter((e) => e.fi >= 0.15 && e.fj >= 0.15 && e.fi <= N - 0.15 && e.fj <= N - 0.15).map((e) => e.box(v.time));
      const t = v.city.tower;
      if (t) boxes.push([t.wx + t.spr.ax - 4, t.wy + t.spr.top - 4, 8, 8]);
      for (const [bx, by, bw, bh] of boxes) {
        const [x0, y0] = v.toDev(bx - 2, by - 2),
          [x1, y1] = v.toDev(bx + bw + 2, by + bh + 2);
        for (let y = Math.max(0, Math.floor(y0)); y < Math.min(h, y1); y++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(w, x1); x++) mask[y * w + x] = 1;
      }
      let n = 0;
      for (let p = 0; p < w * h; p++) {
        if (mask[p]) continue;
        const a = p * 4;
        if (Math.abs(moving[a] - still[a]) > TOL || Math.abs(moving[a + 1] - still[a + 1]) > TOL || Math.abs(moving[a + 2] - still[a + 2]) > TOL) n++;
      }
      if (n) bad++;
      worst = Math.max(worst, n);
    }
    out[short] = { frames: 120, framesWithWrongPixels: bad, worstFramePixels: worst };
  }
  return out;
})()
