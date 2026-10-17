// Checks that buildings hide what's behind them, pixel for pixel. With the
// smoke, flyers, signs and radios turned off, everything outside the moving
// vehicles' boxes must be exactly the city's still picture, frame after
// frame, as traffic goes behind and in front of buildings. Run it in the
// page, with all four demo cities built:
//
//   node tools/shoot.mjs "http://localhost:8099/?demo" "" --wait 16 --eval "$(cat tools/occlusion.js)"
//
// → { city: { frames, framesWithWrongPixels, worstFramePixels } }: wrong
// pixels anywhere means a building drawn out of turn.

(async () => {
  document.getElementById("v4").click();
  await new Promise((r) => setTimeout(r, 1500));
  trunkCity.settings.whimsy = false;
  const out = {};
  for (const [short, c] of trunkCity.cities) {
    const v = c.view;
    v.zoom = 1;
    v.resize();
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
    const layer = v.dim ? v.layerDim : v.layer;
    const still = layer.getContext("2d").getImageData(0, 0, layer.width, layer.height).data;
    let bad = 0,
      worst = 0;
    for (let f = 0; f < 200; f++) {
      v.update(0.25);
      v.cx = 0;
      v.cy = v.city.N * 8;
      v.render();
      const w = v.canvas.width,
        h = v.canvas.height;
      const vx = Math.round(v.cx - w / 2),
        vy = Math.round(v.cy - h / 2);
      const N = v.city.N;
      const mask = new Uint8Array(w * h);
      const boxes = v.ents.filter((e) => e.fi >= 0.15 && e.fj >= 0.15 && e.fi <= N - 0.15 && e.fj <= N - 0.15).map((e) => e.box(v.time));
      const t = v.city.tower;
      if (t) boxes.push([t.wx + t.spr.ax - 2, t.wy + t.spr.top - 2, 5, 5]);
      for (const [bx, by, bw, bh] of boxes)
        for (let y = Math.max(0, Math.floor(by - vy) - 1); y < Math.min(h, by - vy + bh + 1); y++)
          for (let x = Math.max(0, Math.floor(bx - vx) - 1); x < Math.min(w, bx - vx + bw + 1); x++) mask[y * w + x] = 1;
      const d = v.ctx.getImageData(0, 0, w, h).data;
      let n = 0;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          if (mask[y * w + x]) continue;
          const lx = x + vx + v.ox,
            ly = y + vy + v.oy;
          if (lx < 0 || ly < 0 || lx >= layer.width || ly >= layer.height) continue;
          const a = (y * w + x) * 4,
            b = (ly * layer.width + lx) * 4;
          if (!still[b + 3]) continue;
          if (d[a] !== still[b] || d[a + 1] !== still[b + 1] || d[a + 2] !== still[b + 2]) n++;
        }
      if (n) bad++;
      worst = Math.max(worst, n);
    }
    out[short] = { frames: 200, framesWithWrongPixels: bad, worstFramePixels: worst };
  }
  return out;
})()
