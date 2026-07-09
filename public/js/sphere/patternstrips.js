// Spherical pattern -> sliceform strips (Phase 2b) — pure math, no THREE / no DOM.
//
// Builds an {n/s} star (midpoint chords, e.g. a pentagram on each pentagon) on
// every face of a solid, projects it onto the sphere, then:
//   - finds the interior chord crossings (the slot points),
//   - traces continuous strips across faces (straightest continuation at the
//     shared edge midpoints where chords meet),
//   - develops each strip to a flat annular sector (radius = sphere radius),
//     which is the exact flattening of a radial wall on a sphere.
// Relies on window.SpherePattern for the polyhedron faces.
(function () {
  "use strict";

  var EPS = 1e-6;
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var L = len(a); return L < EPS ? [0, 0, 0] : [a[0] / L, a[1] / L, a[2] / L]; }
  function proj(p, R) { return scale(unit(p), R); }          // radial projection to sphere
  function arcLen(a, b, R) { return R * Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (R * R)))); }

  function midpointKey(p) { return p.map(function (x) { return Math.round(x * 1e5); }).join(","); }

  function build(solidName, opts) {
    opts = opts || {};
    var R = opts.radius || 1;
    var skip = opts.skip || 2;
    var SP = window.SpherePattern;
    var verts = SP.POLYHEDRA[solidName].verts;
    var faces = SP.extractFaces(verts);

    // --- chords (midpoint i -> midpoint i+skip) per face ---------------------------
    var mids = {};   // global midpoint id -> {pos3D(on sphere)}
    var chords = []; // {a,b: global mid ids, faceIdx, ends:[{mid,dir3D}], mid3D:[..]}
    faces.forEach(function (f, fi) {
      var n = f.length;
      var fpos = f.map(function (k) { return verts[k]; });
      var faceMids = [];
      for (var i = 0; i < n; i++) {
        var m = scale(add(fpos[i], fpos[(i + 1) % n]), 0.5);   // edge midpoint (flat)
        var key = midpointKey(proj(m, 1));
        if (!(key in mids)) mids[key] = { id: Object.keys(mids).length, pos: proj(m, R) };
        faceMids.push({ key: key, flat: m });
      }
      var s = Math.min(skip, n - 1);
      for (var j = 0; j < n; j++) {
        var a = faceMids[j], b = faceMids[(j + s) % n];
        if (a.key === b.key) continue;
        chords.push({
          faceIdx: fi, aKey: a.key, bKey: b.key,
          aFlat: a.flat, bFlat: b.flat,
          aDir: unit(sub(b.flat, a.flat)), bDir: unit(sub(a.flat, b.flat))
        });
      }
    });

    // --- interior crossings, per face (chord-chord intersections) ------------------
    var crossings = []; // {pos3D, chords:[ci,cj], t:[ta,tb]}
    var byFace = {};
    chords.forEach(function (c, ci) { (byFace[c.faceIdx] = byFace[c.faceIdx] || []).push(ci); });
    Object.keys(byFace).forEach(function (fi) {
      var list = byFace[fi];
      for (var x = 0; x < list.length; x++)
        for (var y = x + 1; y < list.length; y++) {
          var ci = list[x], cj = list[y];
          var hit = segInt(chords[ci].aFlat, chords[ci].bFlat, chords[cj].aFlat, chords[cj].bFlat);
          if (hit) crossings.push({ pos: proj(hit.p, R), chords: [ci, cj], t: [hit.ta, hit.tb] });
        }
    });
    // attach crossings to their chords with parametric position
    chords.forEach(function (c) { c.cross = []; });
    crossings.forEach(function (x, xi) {
      chords[x.chords[0]].cross.push({ t: x.t[0], xi: xi });
      chords[x.chords[1]].cross.push({ t: x.t[1], xi: xi });
    });

    // --- trace strips across faces (straightest continuation at edge midpoints) ----
    // half-edges: 2 per chord (a->b, b->a)
    var H = [];
    chords.forEach(function (c, ci) {
      H.push({ chord: ci, from: c.aKey, to: c.bKey, dirAtTo: unit(sub(c.aFlat, c.bFlat)) });
      H.push({ chord: ci, from: c.bKey, to: c.aKey, dirAtTo: unit(sub(c.bFlat, c.aFlat)) });
    });
    // group half-edges arriving at each midpoint, pair to a departing one (other face, straightest)
    var arriveAt = {}, departFrom = {};
    H.forEach(function (h, hi) {
      (arriveAt[h.to] = arriveAt[h.to] || []).push(hi);
      (departFrom[h.from] = departFrom[h.from] || []).push(hi);
    });
    var next = new Array(H.length).fill(-1);
    Object.keys(arriveAt).forEach(function (mkey) {
      var incoming = arriveAt[mkey], outgoing = departFrom[mkey] || [];
      incoming.forEach(function (hi) {
        var vel = H[hi].dirAtTo;                 // velocity arriving at the midpoint
        var best = -1, bestDot = -Infinity;
        outgoing.forEach(function (ho) {
          if (chords[H[ho].chord].faceIdx === chords[H[hi].chord].faceIdx) return; // cross the edge
          var d = dot(vel, unit(sub(chords[H[ho].chord][H[ho].from === chords[H[ho].chord].aKey ? "bFlat" : "aFlat"], chords[H[ho].chord][H[ho].from === chords[H[ho].chord].aKey ? "aFlat" : "bFlat"])));
          if (d > bestDot) { bestDot = d; best = ho; }
        });
        next[hi] = best;
      });
    });

    // walk half-edges into closed strips
    // Each chord is one physical strip segment, traversed once. Consuming a
    // half-edge also consumes its sibling (the reverse direction) so a strip and
    // its reverse are not both emitted.
    var used = new Array(H.length).fill(false);
    var strips = [];
    for (var start = 0; start < H.length; start++) {
      if (used[start] || next[start] < 0) continue;
      var seq = [], h = start, guard = 0;
      while (h >= 0 && !used[h] && guard++ < H.length * 2) {
        used[h] = true; used[h ^ 1] = true; seq.push(h); h = next[h];
      }
      if (seq.length) strips.push(seq);
    }

    // --- develop each strip to an annular sector (radius R) ------------------------
    var stripData = strips.map(function (seq, si) {
      var arc = 0, slots = [], pts = [];
      seq.forEach(function (hi) {
        var h = H[hi], c = chords[h.chord];
        var fwd = (h.from === c.aKey);
        var p0 = fwd ? c.aFlat : c.bFlat, p1 = fwd ? c.bFlat : c.aFlat;
        // sample the projected chord for length + preview points
        var prev = proj(p0, R); pts.push(prev);
        var segStart = arc;
        for (var g = 1; g <= 16; g++) {
          var f = g / 16;
          var cur = proj(add(scale(p0, 1 - f), scale(p1, f)), R);
          arc += arcLen(prev, cur, R);
          pts.push(cur);
          prev = cur;
        }
        // place this chord's crossings by fraction along the finished chord arc
        var chordArc = arc - segStart;
        c.cross.forEach(function (cc) {
          var frac = fwd ? cc.t : 1 - cc.t;
          slots.push({ pos: segStart + frac * chordArc, xi: cc.xi });
        });
      });
      return { arcLen: arc, slots: slots, points: pts, index: si };
    });

    return {
      radius: R, faces: faces, verts: verts.map(unit),
      chords: chords, crossings: crossings, strips: stripData,
      stripCount: stripData.length
    };
  }

  // 2D-ish segment intersection in 3D (segments assumed near-coplanar within a face)
  function segInt(p1, p2, p3, p4) {
    var d1 = sub(p2, p1), d2 = sub(p4, p3), r = sub(p1, p3);
    var a = dot(d1, d1), b = dot(d1, d2), c = dot(d2, d2), d = dot(d1, r), e = dot(d2, r);
    var den = a * c - b * b;
    if (Math.abs(den) < 1e-12) return null;
    var ta = (b * e - c * d) / den, tb = (a * e - b * d) / den;
    if (ta <= 0.02 || ta >= 0.98 || tb <= 0.02 || tb >= 0.98) return null; // strictly interior
    var pa = add(p1, scale(d1, ta)), pb = add(p3, scale(d2, tb));
    if (len(sub(pa, pb)) > 1e-6 * (1 + len(d1))) return null;             // actually meet
    return { p: scale(add(pa, pb), 0.5), ta: ta, tb: tb };
  }

  // ---- developed cutting template ----------------------------------------------
  // Each strip develops to an annular sector of mean radius = sphere radius, span =
  // arcLen / R (an open arc, since a non-great-circle loop has an angular deficit
  // that bends the flat piece into 3D when its ends are joined). Split into arcs
  // for assembly; radial slots at each crossing, alternating outer/inner edge.
  function stripsToSVG(model, opts) {
    opts = opts || {};
    var scaleF = opts.scale || 1;
    var hpx = (opts.stripHeight || 8) * scaleF;
    var split = opts.split || 2;
    var Rpx = model.radius * scaleF, ri = Rpx - hpx / 2, ro = Rpx + hpx / 2;
    var els = [];

    // build every arc piece first (for grid layout)
    var pieces = [];
    model.strips.forEach(function (strip) {
      var span = strip.arcLen / model.radius;                 // radians
      var slots = strip.slots.map(function (sl) { return sl.pos / model.radius; })
        .sort(function (a, b) { return a - b; });
      var N = slots.length, k = Math.max(1, Math.min(split, N));
      for (var m = 0; m < k; m++) {
        var s0 = Math.round(m * N / k), s1 = Math.round((m + 1) * N / k);
        var a0 = (s0 === 0) ? 0 : (slots[s0 - 1] + slots[s0]) / 2;
        var a1 = (s1 >= N) ? span : (slots[s1 - 1] + slots[s1]) / 2;
        var pieceSlots = [];
        for (var c = s0; c < s1; c++) pieceSlots.push({ ang: slots[c], edge: c % 2 });
        pieces.push({ a0: a0, a1: a1, slots: pieceSlots, label: "#" + strip.index + "." + m });
      }
    });

    var margin = 20, pad = Math.max(16, hpx * 1.5), cell = 2 * ro + pad;
    var cols = Math.ceil(Math.sqrt(pieces.length)), rows = Math.ceil(pieces.length / cols);
    pieces.forEach(function (p, i) {
      var cx = margin + (i % cols) * cell + cell / 2, cy = margin + Math.floor(i / cols) * cell + cell / 2;
      els.push(sector(cx, cy, ri, ro, p.a0, p.a1, "#0000ff"));
      p.slots.forEach(function (sl) {
        var fromR = (sl.edge === 0) ? ro : ri, toR = Rpx;
        var a = pt(cx, cy, fromR, sl.ang), b = pt(cx, cy, toR, sl.ang);
        els.push(seg(a[0], a[1], b[0], b[1], "#000000"));
      });
      var mid = (p.a0 + p.a1) / 2, lp = pt(cx, cy, Rpx, mid);
      els.push(text(lp[0], lp[1], p.label));
    });

    var W = Math.ceil(cols * cell + 2 * margin), H = Math.ceil(rows * cell + 2 * margin);
    return [
      "<?xml version='1.0' encoding='utf-8'?>",
      "<svg xmlns='http://www.w3.org/2000/svg' width='" + W + "' height='" + H + "' viewBox='0 0 " + W + " " + H + "'>",
      "<style>line{stroke-width:1;fill:none}path{fill:none;stroke-width:1}text{font:9px sans-serif;fill:#333;text-anchor:middle}</style>",
      els.join(""), "</svg>"
    ].join("");

    function pt(cx, cy, rr, ang) { return [cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)]; }
    function sector(cx, cy, ri, ro, a0, a1, c) {
      var large = (a1 - a0) > Math.PI ? 1 : 0;
      var o0 = pt(cx, cy, ro, a0), o1 = pt(cx, cy, ro, a1), i1 = pt(cx, cy, ri, a1), i0 = pt(cx, cy, ri, a0);
      return "<path d='M" + r(o0[0]) + " " + r(o0[1]) + "A" + r(ro) + " " + r(ro) + " 0 " + large + " 1 " + r(o1[0]) + " " + r(o1[1]) +
        "L" + r(i1[0]) + " " + r(i1[1]) + "A" + r(ri) + " " + r(ri) + " 0 " + large + " 0 " + r(i0[0]) + " " + r(i0[1]) + "Z' stroke='" + c + "'/>";
    }
    function seg(x1, y1, x2, y2, c) { return "<line x1='" + r(x1) + "' y1='" + r(y1) + "' x2='" + r(x2) + "' y2='" + r(y2) + "' stroke='" + c + "'/>"; }
    function text(x, y, t) { return "<text x='" + r(x) + "' y='" + r(y + 3) + "'>" + t + "</text>"; }
    function r(n) { return Math.round(n * 100) / 100; }
  }

  window.SpherePatternStrips = { build: build, stripsToSVG: stripsToSVG };
})();
