// Spherical pattern -> sliceform strips (Phase 2b/2c) — pure math, no THREE / DOM.
//
// Builds the Star/Rosette motif (window.SphereRosette) on every face, projects it
// onto the sphere, then:
//   - finds interior crossings between the motif polylines (the slot points),
//   - traces continuous strips across faces (straightest continuation at the shared
//     edge midpoints where motif arms meet),
//   - develops each strip to a flat annular sector (radius = sphere radius), the
//     exact flattening of a radial wall on a sphere.
// Relies on window.SpherePattern (faces) and window.SphereRosette (motif).
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
  function proj(p, R) { return scale(unit(p), R); }
  function arcLen(a, b, R) { return R * Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (R * R)))); }
  function key3(p) { return proj(p, 1).map(function (x) { return Math.round(x * 1e5); }).join(","); }

  // 2D segment intersection (strictly interior); returns { p, ta, tb } or null
  function segInt2(p1, p2, p3, p4) {
    var d1 = [p2[0] - p1[0], p2[1] - p1[1]], d2 = [p4[0] - p3[0], p4[1] - p3[1]];
    var den = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(den) < 1e-12) return null;
    var ta = ((p3[0] - p1[0]) * d2[1] - (p3[1] - p1[1]) * d2[0]) / den;
    var tb = ((p3[0] - p1[0]) * d1[1] - (p3[1] - p1[1]) * d1[0]) / den;
    if (ta <= 0.02 || ta >= 0.98 || tb <= 0.02 || tb >= 0.98) return null;
    return { p: [p1[0] + ta * d1[0], p1[1] + ta * d1[1]], ta: ta, tb: tb };
  }

  function build(solidName, opts) {
    opts = opts || {};
    var R = opts.radius || 1;
    var style = opts.style || "rosette";
    var SP = window.SpherePattern, RO = window.SphereRosette;
    var verts = SP.POLYHEDRA[solidName].verts;
    var faces = SP.extractFaces(verts);

    var mids = {};       // global midpoint key -> id
    var patterns = [];   // one motif polyline per (face, edge)

    faces.forEach(function (f, fi) {
      var fv = f.map(function (k) { return verts[k]; });
      var O = scale(fv.reduce(function (s, p) { return add(s, p); }, [0, 0, 0]), 1 / fv.length);
      var nrm = unit(cross(sub(fv[1], fv[0]), sub(fv[2], fv[0])));
      if (dot(nrm, O) < 0) nrm = scale(nrm, -1);
      var u = unit(sub(fv[0], O)), v = cross(nrm, u);
      var to2 = function (p) { var w = sub(p, O); return [dot(w, u), dot(w, v)]; };
      var from2 = function (q) { return add(O, add(scale(u, q[0]), scale(v, q[1]))); };
      var poly2D = fv.map(to2);
      var n = fv.length;
      var angle = (opts.angles && opts.angles[n] != null) ? opts.angles[n]
        : (opts.angleDeg != null ? opts.angleDeg : RO.defaultAngle(style, n));
      var depth = opts.depth || (n > 4 ? 2 : 1);
      var tmpl = RO.templateFor(style, n, angle);
      var d = Math.max(1, Math.min(depth, RO.maxDepth(style, n, angle, tmpl)));

      // global keys for each edge midpoint of this face
      var midKey = [];
      for (var j = 0; j < n; j++) {
        var m = [(poly2D[j][0] + poly2D[(j + 1) % n][0]) / 2, (poly2D[j][1] + poly2D[(j + 1) % n][1]) / 2];
        var k3 = key3(from2(m));
        if (!(k3 in mids)) mids[k3] = Object.keys(mids).length;
        midKey.push(k3);
      }

      RO.faceMotif2D(poly2D, style, angle, depth).forEach(function (poly2, j) {
        var poly3 = poly2.map(function (q) { return proj(from2(q), R); });
        var segArc = [], cum = [0], total = 0;
        for (var s = 0; s < poly3.length - 1; s++) {
          var a = arcLen(poly3[s], poly3[s + 1], R);
          segArc.push(a); total += a; cum.push(total);
        }
        patterns.push({
          faceIdx: fi, aKey: midKey[j], bKey: midKey[(j + d) % n],
          poly2: poly2, poly3: poly3, segArc: segArc, cum: cum, arcTotal: total,
          aDir: unit(sub(poly3[1], poly3[0])),
          bDir: unit(sub(poly3[poly3.length - 2], poly3[poly3.length - 1])),
          cross: []
        });
      });
    });

    // ---- interior crossings, per face (motif polyline intersections) -------------
    var crossings = [], byFace = {};
    patterns.forEach(function (p, pi) { (byFace[p.faceIdx] = byFace[p.faceIdx] || []).push(pi); });
    Object.keys(byFace).forEach(function (fi) {
      var list = byFace[fi];
      for (var x = 0; x < list.length; x++)
        for (var y = x + 1; y < list.length; y++) {
          var P = patterns[list[x]], Q = patterns[list[y]];
          for (var a = 0; a < P.poly2.length - 1; a++)
            for (var b = 0; b < Q.poly2.length - 1; b++) {
              var hit = segInt2(P.poly2[a], P.poly2[a + 1], Q.poly2[b], Q.poly2[b + 1]);
              if (!hit) continue;
              var xi = crossings.length;
              var posP = P.cum[a] + hit.ta * P.segArc[a];
              var posQ = Q.cum[b] + hit.tb * Q.segArc[b];
              // 3D position (project the interpolated point on P's segment)
              var p3 = proj(add(scale(P.poly3[a], 1 - hit.ta), scale(P.poly3[a + 1], hit.ta)), R);
              crossings.push({ pos: p3, patterns: [list[x], list[y]] });
              P.cross.push({ pos: posP, xi: xi });
              Q.cross.push({ pos: posQ, xi: xi });
            }
        }
    });

    // ---- trace strips across faces (straightest continuation) --------------------
    var H = [];
    patterns.forEach(function (c, ci) {
      H.push({ pat: ci, from: c.aKey, to: c.bKey, velAtTo: unit(sub(c.poly3[c.poly3.length - 1], c.poly3[c.poly3.length - 2])) });
      H.push({ pat: ci, from: c.bKey, to: c.aKey, velAtTo: unit(sub(c.poly3[0], c.poly3[1])) });
    });
    var arriveAt = {}, departFrom = {};
    H.forEach(function (h, hi) { (arriveAt[h.to] = arriveAt[h.to] || []).push(hi); (departFrom[h.from] = departFrom[h.from] || []).push(hi); });
    var next = new Array(H.length).fill(-1);
    Object.keys(arriveAt).forEach(function (mkey) {
      (arriveAt[mkey] || []).forEach(function (hi) {
        var vel = H[hi].velAtTo, best = -1, bestDot = -Infinity;
        (departFrom[mkey] || []).forEach(function (ho) {
          if (patterns[H[ho].pat].faceIdx === patterns[H[hi].pat].faceIdx) return; // cross the edge
          var out = (H[ho].from === patterns[H[ho].pat].aKey) ? patterns[H[ho].pat].aDir : patterns[H[ho].pat].bDir;
          var d = dot(vel, out);
          if (d > bestDot) { bestDot = d; best = ho; }
        });
        next[hi] = best;
      });
    });

    var used = new Array(H.length).fill(false), strips = [];
    for (var start = 0; start < H.length; start++) {
      if (used[start] || next[start] < 0) continue;
      var seq = [], h = start, guard = 0;
      while (h >= 0 && !used[h] && guard++ < H.length * 2) { used[h] = true; used[h ^ 1] = true; seq.push(h); h = next[h]; }
      if (seq.length) { seq.forEach(function (hi) { patterns[H[hi].pat].strip = strips.length; }); strips.push(seq); }
    }

    // ---- develop each strip to arc length + slot positions ------------------------
    var stripData = strips.map(function (seq, si) {
      var arc = 0, slots = [], pts = [];
      seq.forEach(function (hi) {
        var h = H[hi], c = patterns[h.pat], fwd = (h.from === c.aKey);
        var line = fwd ? c.poly3 : c.poly3.slice().reverse();
        for (var s = 0; s < line.length - (hi === seq[seq.length - 1] ? 0 : 1); s++) pts.push(line[s]);
        c.cross.forEach(function (cc) {
          slots.push({ pos: arc + (fwd ? cc.pos : c.arcTotal - cc.pos), xi: cc.xi });
        });
        arc += c.arcTotal;
      });
      return { index: si, arcLen: arc, slots: slots, points: pts };
    });

    var weave = solveWeave(stripData);

    return {
      radius: R, faces: faces, verts: verts.map(unit),
      chords: patterns, crossings: crossings, strips: stripData, stripCount: stripData.length,
      weaveConflicts: weave.conflicts
    };
  }

  // Over/under weave. The variable is per CROSSING: which of its two strips is
  // "over". That makes the interlock constraint automatic — the two strips always
  // get opposite slot edges. Separately we prefer a plain weave, i.e. each strip
  // alternates over/under along its length; consecutive crossings on a strip give
  // an XOR constraint between their crossing-variables, solved with weighted
  // union-find. Where the constraint graph has an odd cycle the alternation can't
  // hold (counted as a conflict) but the interlock is never broken. Sets slot.edge.
  function solveWeave(stripData) {
    var inc = {};   // xi -> [{strip, slot}]
    stripData.forEach(function (s, si) {
      s.slots.sort(function (a, b) { return a.pos - b.pos; });
      s.slots.forEach(function (sl) { (inc[sl.xi] = inc[sl.xi] || []).push({ strip: si, slot: sl }); });
    });
    var xis = Object.keys(inc), id = {};
    xis.forEach(function (xi, i) { id[xi] = i; });
    var lowAt = {}; // xi -> lower strip index
    xis.forEach(function (xi) { var a = inc[xi]; lowAt[xi] = a.length === 2 ? Math.min(a[0].strip, a[1].strip) : a[0].strip; });

    var parent = xis.map(function (_, i) { return i; }), rel = xis.map(function () { return 0; });
    function find(x) {
      if (parent[x] === x) return { root: x, par: 0 };
      var f = find(parent[x]); parent[x] = f.root; rel[x] = rel[x] ^ f.par; return { root: f.root, par: rel[x] };
    }
    function low(xi, si) { return lowAt[xi] === si ? 1 : 0; }

    var conflicts = 0;
    stripData.forEach(function (s, si) {
      var k = s.slots.length;
      for (var i = 0; i < k; i++) {
        var A = s.slots[i].xi, Bi = (i + 1) % k, B = s.slots[Bi].xi;
        if (k > 1 && i === k - 1 && (k % 2 === 1)) continue; // don't force the odd-loop seam
        var want = 1 ^ low(A, si) ^ low(B, si);
        var fa = find(id[A]), fb = find(id[B]);
        if (fa.root === fb.root) { if ((fa.par ^ fb.par) !== want) conflicts++; }
        else { parent[fb.root] = fa.root; rel[fb.root] = fa.par ^ fb.par ^ want; }
      }
    });

    xis.forEach(function (xi) {
      var o = find(id[xi]).par;
      inc[xi].forEach(function (e) {
        var over = o ^ 1 ^ low(xi, e.strip); // lower strip over when o=1
        e.slot.edge = over ? 0 : 1;           // over -> cut from outer edge
      });
    });
    return { conflicts: conflicts };
  }

  // ---- developed cutting template ----------------------------------------------
  // Each strip develops to an annular sector of mean radius = sphere radius, span =
  // arcLen / R (an open arc; its angular deficit bends the flat piece into 3D when
  // the ends are joined). Split into arcs for assembly; radial slots at each
  // crossing, alternating outer/inner edge, drawn as visible notches.
  function stripsToSVG(model, opts) {
    opts = opts || {};
    var scaleF = opts.scale || 1;
    var hpx = (opts.stripHeight || 8) * scaleF;
    var split = opts.split || 2;
    var Rpx = model.radius * scaleF, ri = Rpx - hpx / 2, ro = Rpx + hpx / 2;
    var els = [];

    var pieces = [];
    model.strips.forEach(function (strip) {
      var span = strip.arcLen / model.radius;
      var slots = strip.slots.map(function (sl) { return { ang: sl.pos / model.radius, edge: sl.edge }; })
        .sort(function (a, b) { return a.ang - b.ang; });
      var N = slots.length, k = Math.max(1, Math.min(split, N || 1));
      for (var m = 0; m < k; m++) {
        var s0 = Math.round(m * N / k), s1 = Math.round((m + 1) * N / k);
        var a0 = (s0 === 0) ? 0 : (slots[s0 - 1].ang + slots[s0].ang) / 2;
        var a1 = (s1 >= N) ? span : (slots[s1 - 1].ang + slots[s1].ang) / 2;
        var ps = [];
        for (var c = s0; c < s1; c++) ps.push({ ang: slots[c].ang, edge: slots[c].edge });
        pieces.push({ a0: a0, a1: a1, slots: ps, label: "#" + strip.index + "." + m });
      }
    });

    var margin = 20, pad = Math.max(16, hpx * 1.5), cell = 2 * ro + pad;
    var cols = Math.ceil(Math.sqrt(pieces.length)), rows = Math.ceil(pieces.length / cols);
    var kerf = 1.4 * scaleF;
    pieces.forEach(function (p, i) {
      var cx = margin + (i % cols) * cell + cell / 2, cy = margin + Math.floor(i / cols) * cell + cell / 2;
      els.push(sector(cx, cy, ri, ro, p.a0, p.a1, "#0000ff"));
      var dA = (kerf / 2) / Rpx;
      p.slots.forEach(function (sl) {
        var fromR = (sl.edge === 0) ? ro : ri;
        els.push(notch(cx, cy, fromR, Rpx, sl.ang, dA));
      });
      var mid = (p.a0 + p.a1) / 2, lp = pt(cx, cy, Rpx, mid);
      els.push(text(lp[0], lp[1], p.label));
    });

    var W = Math.ceil(cols * cell + 2 * margin), H = Math.ceil(rows * cell + 2 * margin);
    return [
      "<?xml version='1.0' encoding='utf-8'?>",
      "<svg xmlns='http://www.w3.org/2000/svg' width='" + W + "' height='" + H + "' viewBox='0 0 " + W + " " + H + "'>",
      "<style>path{fill:none;stroke-width:1}text{font:9px sans-serif;fill:#333;text-anchor:middle}</style>",
      els.join(""), "</svg>"
    ].join("");

    function pt(cx, cy, rr, ang) { return [cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)]; }
    function sector(cx, cy, ri, ro, a0, a1, c) {
      var large = (a1 - a0) > Math.PI ? 1 : 0;
      var o0 = pt(cx, cy, ro, a0), o1 = pt(cx, cy, ro, a1), i1 = pt(cx, cy, ri, a1), i0 = pt(cx, cy, ri, a0);
      return "<path d='M" + r(o0[0]) + " " + r(o0[1]) + "A" + r(ro) + " " + r(ro) + " 0 " + large + " 1 " + r(o1[0]) + " " + r(o1[1]) +
        "L" + r(i1[0]) + " " + r(i1[1]) + "A" + r(ri) + " " + r(ri) + " 0 " + large + " 0 " + r(i0[0]) + " " + r(i0[1]) + "Z' stroke='" + c + "'/>";
    }
    function notch(cx, cy, fromR, toR, ang, dA) {
      var s1o = pt(cx, cy, fromR, ang - dA), s1i = pt(cx, cy, toR, ang - dA);
      var s2i = pt(cx, cy, toR, ang + dA), s2o = pt(cx, cy, fromR, ang + dA);
      return "<path d='M" + r(s1o[0]) + " " + r(s1o[1]) + "L" + r(s1i[0]) + " " + r(s1i[1]) +
        "L" + r(s2i[0]) + " " + r(s2i[1]) + "L" + r(s2o[0]) + " " + r(s2o[1]) + "' stroke='#000000'/>";
    }
    function text(x, y, t) { return "<text x='" + r(x) + "' y='" + r(y + 3) + "'>" + t + "</text>"; }
    function r(n) { return Math.round(n * 100) / 100; }
  }

  window.SpherePatternStrips = { build: build, stripsToSVG: stripsToSVG };
})();
