// Spherical-sliceform geometry (Phase 1) — pure math, no THREE / no DOM.
//
// Produces great-circle arrangements on a sphere, their pairwise crossings, the
// per-circle slot positions, an over/under weave, and a flattened straight-strip
// layout that can be exported as an SVG cutting template. Exposed as a global
// (the app uses classic <script> tags, not modules).
(function () {
  "use strict";

  var PHI = (1 + Math.sqrt(5)) / 2;
  var EPS = 1e-6;

  // ---- small vector helpers (plain [x,y,z] arrays) ------------------------------
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var L = len(a); return L < EPS ? [0, 0, 0] : [a[0] / L, a[1] / L, a[2] / L]; }
  function dist(a, b) { return len(sub(a, b)); }

  // ---- polyhedron vertex sets (for deriving symmetry axes) ----------------------
  function signs(coords) {
    var out = [], idx = [];
    for (var i = 0; i < 3; i++) if (coords[i] !== 0) idx.push(i);
    for (var m = 0; m < (1 << idx.length); m++) {
      var v = coords.slice();
      for (var b = 0; b < idx.length; b++) if (m & (1 << b)) v[idx[b]] = -v[idx[b]];
      out.push(v);
    }
    return out;
  }
  function cyclic(c) {
    return dedupe([].concat(
      signs([c[0], c[1], c[2]]), signs([c[2], c[0], c[1]]), signs([c[1], c[2], c[0]])));
  }
  function dedupe(vs) {
    var out = [];
    vs.forEach(function (v) {
      if (!out.some(function (w) { return dist(v, w) < 1e-9; })) out.push(v);
    });
    return out;
  }

  var ICOSA = cyclic([0, 1, PHI]);            // 12 vertices  (5-fold axes)
  var DODECA = signs([1, 1, 1]).concat(cyclic([0, 1 / PHI, PHI])); // 20 (3-fold axes)

  // edges = vertex pairs at the minimum distance
  function edges(verts) {
    var min = Infinity, i, j, d;
    for (i = 0; i < verts.length; i++)
      for (j = i + 1; j < verts.length; j++) {
        d = dist(verts[i], verts[j]);
        if (d > EPS && d < min) min = d;
      }
    var out = [];
    for (i = 0; i < verts.length; i++)
      for (j = i + 1; j < verts.length; j++)
        if (dist(verts[i], verts[j]) <= min * 1.02) out.push([i, j]);
    return out;
  }

  // keep one representative per antipodal pair of directions
  function dedupeAntipodal(dirs) {
    var out = [];
    dirs.map(unit).forEach(function (d) {
      if (!out.some(function (w) { return dist(d, w) < 1e-6 || dist(scale(d, -1), w) < 1e-6; })) out.push(d);
    });
    return out;
  }

  function edgeMidpointDirs(verts) {
    return dedupeAntipodal(edges(verts).map(function (e) {
      return unit(scale(add(verts[e[0]], verts[e[1]]), 0.5));
    }));
  }

  // ---- great-circle arrangements (normals) --------------------------------------
  // Icosahedral families: 6 = 5-fold axes (icosa verts), 10 = 3-fold axes (dodeca
  // verts), 15 = 2-fold axes (edge midpoints). 31 = their union.
  var ARRANGEMENTS = {
    ortho3: { label: "3 orthogonal circles", normals: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
    ico6: { label: "6 great circles (icosahedral)", normals: dedupeAntipodal(ICOSA) },
    ico10: { label: "10 great circles (icosahedral)", normals: dedupeAntipodal(DODECA) },
    ico15: { label: "15 great circles (icosahedral)", normals: edgeMidpointDirs(ICOSA) },
    ico31: {
      label: "31 great circles (icosahedral)",
      normals: dedupeAntipodal([].concat(ICOSA, DODECA, edgeMidpointDirs(ICOSA)))
    }
  };

  // orthonormal in-plane basis for a circle with the given normal
  function basisFor(normal) {
    var n = unit(normal);
    var ref = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    var u = unit(cross(n, ref));
    var v = cross(n, u);
    return { n: n, u: u, v: v };
  }

  // sample points around a great circle (for the 3D preview)
  function circlePoints(normal, R, segments) {
    var b = basisFor(normal), pts = [];
    for (var i = 0; i <= segments; i++) {
      var t = i / segments * 2 * Math.PI;
      pts.push(add(scale(b.u, R * Math.cos(t)), scale(b.v, R * Math.sin(t))));
    }
    return pts;
  }

  // ---- crossings ----------------------------------------------------------------
  // Returns { points:[{pos,circles:[i..]}], perCircle:[[{angle,cluster}..]..] }
  function computeCrossings(normals, R) {
    var raw = [];
    for (var i = 0; i < normals.length; i++)
      for (var j = i + 1; j < normals.length; j++) {
        var c = cross(normals[i], normals[j]);
        if (len(c) < EPS) continue; // identical / parallel planes
        var d = unit(c);
        raw.push({ pos: scale(d, R), circles: [i, j] });
        raw.push({ pos: scale(d, -R), circles: [i, j] });
      }

    // cluster coincident points -> detect multi-way junctions
    var clusters = [];
    raw.forEach(function (p) {
      var cl = clusters.find(function (k) { return dist(k.pos, p.pos) < R * 1e-4; });
      if (!cl) { cl = { pos: p.pos, circles: [] }; clusters.push(cl); }
      p.circles.forEach(function (ci) { if (cl.circles.indexOf(ci) < 0) cl.circles.push(ci); });
    });

    // per-circle sorted slot angles (one entry per cluster that touches the circle)
    var perCircle = normals.map(function (normal, ci) {
      var b = basisFor(normal);
      var entries = [];
      clusters.forEach(function (cl, cid) {
        if (cl.circles.indexOf(ci) < 0) return;
        var angle = Math.atan2(dot(cl.pos, b.v), dot(cl.pos, b.u));
        if (angle < 0) angle += 2 * Math.PI;
        entries.push({ angle: angle, cluster: cid, multiplicity: cl.circles.length });
      });
      entries.sort(function (a, b2) { return a.angle - b2.angle; });
      return entries;
    });

    return { clusters: clusters, perCircle: perCircle };
  }

  // ---- flatten to straight strips -----------------------------------------------
  // Each great circle -> one straight strip of length 2*pi*R, with a slot at every
  // crossing angle. gaps[] are the arc-length spacings between consecutive slots
  // (wrapping around the seam). parity[] is the alternating over/under assignment.
  function buildStrips(arrangementKey, R) {
    var arr = ARRANGEMENTS[arrangementKey];
    var cr = computeCrossings(arr.normals, R);
    var strips = cr.perCircle.map(function (entries, ci) {
      var circumference = 2 * Math.PI * R;
      var positions = entries.map(function (e) { return e.angle * R; });
      var gaps = [], parity = [];
      for (var k = 0; k < positions.length; k++) {
        var next = (k + 1 < positions.length) ? positions[k + 1] : positions[0] + circumference;
        gaps.push(next - positions[k]);
        parity.push(k % 2 === 0); // simple alternating weave (seam clash if odd count)
      }
      return {
        index: ci,
        circumference: circumference,
        positions: positions,
        gaps: gaps,
        parity: parity,
        multiplicities: entries.map(function (e) { return e.multiplicity; }),
        seamClash: positions.length % 2 === 1
      };
    });
    return { arrangement: arr, crossings: cr, strips: strips };
  }

  // ---- SVG cutting template -----------------------------------------------------
  // A great-circle strip is a radial wall on the sphere, so it flattens to a flat
  // ANNULAR ring: mean radius = sphere radius, width = strip width. It is a curved
  // piece, NOT a straight strip — paper cannot be bent into an in-plane arc without
  // buckling, so it must be cut curved. Slots are radial cuts at each crossing
  // angle, alternating between the outer and inner edge to half depth so two rings
  // interlock. Rings are laid out in a grid.
  function stripsToSVG(model, opts) {
    opts = opts || {};
    var scaleF = opts.scale || 1;        // px per unit length (mm)
    var hpx = (opts.stripHeight || 8) * scaleF; // radial strip width
    var els = [];

    // all great circles share the sphere radius; size the grid cell to the ring
    var maxRo = 0;
    model.strips.forEach(function (s2) {
      maxRo = Math.max(maxRo, (s2.circumference / (2 * Math.PI)) * scaleF + hpx / 2);
    });
    var margin = 20, pad = Math.max(14, hpx);
    var cell = 2 * maxRo + pad;
    var cols = Math.ceil(Math.sqrt(model.strips.length));
    var rows = Math.ceil(model.strips.length / cols);

    model.strips.forEach(function (strip, i) {
      var R = strip.circumference / (2 * Math.PI); // sphere radius (mm)
      var Rpx = R * scaleF, ri = Rpx - hpx / 2, ro = Rpx + hpx / 2;
      var col = i % cols, row = Math.floor(i / cols);
      var cx = margin + col * cell + cell / 2;
      var cy = margin + row * cell + cell / 2;

      // annulus outline (both edges are cut)
      els.push(circle(cx, cy, ro, "#0000ff"));
      els.push(circle(cx, cy, ri, "#0000ff"));

      // radial interlocking slots at each crossing, alternating outer / inner edge
      strip.positions.forEach(function (pos, k) {
        var ang = pos / R; // radians around the ring
        var fromR = (k % 2 === 0) ? ro : ri; // start at outer or inner edge
        var toR = Rpx;                        // cut in to mid depth (h/2)
        var a = pt(cx, cy, fromR, ang), b = pt(cx, cy, toR, ang);
        els.push(seg(a[0], a[1], b[0], b[1], "#000000"));
      });

      els.push(text(cx, cy + 4, "#" + strip.index + (strip.seamClash ? " *" : "")));
    });

    var W = Math.ceil(cols * cell + 2 * margin), H = Math.ceil(rows * cell + 2 * margin);
    return [
      "<?xml version='1.0' encoding='utf-8'?>",
      "<svg xmlns='http://www.w3.org/2000/svg' width='" + W + "' height='" + H + "' viewBox='0 0 " + W + " " + H + "'>",
      "<style>line{stroke-width:1;fill:none}circle{fill:none;stroke-width:1}text{font:11px sans-serif;fill:#333;text-anchor:middle}</style>",
      els.join(""),
      "</svg>"
    ].join("");

    function pt(cx, cy, rr, ang) { return [cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)]; }
    function seg(x1, y1, x2, y2, c) { return "<line x1='" + r(x1) + "' y1='" + r(y1) + "' x2='" + r(x2) + "' y2='" + r(y2) + "' stroke='" + c + "'/>"; }
    function circle(cx, cy, rr, c) { return "<circle cx='" + r(cx) + "' cy='" + r(cy) + "' r='" + r(rr) + "' stroke='" + c + "'/>"; }
    function text(x, yy, t) { return "<text x='" + r(x) + "' y='" + r(yy) + "'>" + t + "</text>"; }
    function r(n) { return Math.round(n * 100) / 100; }
  }

  window.SphereGeom = {
    PHI: PHI,
    ARRANGEMENTS: ARRANGEMENTS,
    circlePoints: circlePoints,
    computeCrossings: computeCrossings,
    buildStrips: buildStrips,
    stripsToSVG: stripsToSVG,
    unit: unit
  };
})();
