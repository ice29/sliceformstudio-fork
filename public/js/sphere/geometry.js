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

  // face centres (triples of mutually-adjacent vertices) -> 3-fold axis directions.
  // Derived from ICOSA itself so all three families share one orientation; using a
  // separately-defined dodecahedron would be in a different frame and break the
  // icosahedral symmetry of the 10- and 31-circle unions.
  function faceCenterDirs(verts) {
    var e = edges(verts), adj = {};
    e.forEach(function (p) { adj[p[0] + "_" + p[1]] = true; });
    function isEdge(a, b) { return adj[Math.min(a, b) + "_" + Math.max(a, b)]; }
    var centers = [];
    for (var a = 0; a < verts.length; a++)
      for (var b = a + 1; b < verts.length; b++)
        for (var c = b + 1; c < verts.length; c++)
          if (isEdge(a, b) && isEdge(a, c) && isEdge(b, c))
            centers.push(unit(scale(add(add(verts[a], verts[b]), verts[c]), 1 / 3)));
    return dedupeAntipodal(centers);
  }

  // ---- great-circle arrangements (normals) --------------------------------------
  // Icosahedral families, all derived from the same ICOSA frame: 6 = 5-fold axes
  // (vertices), 10 = 3-fold axes (face centres), 15 = 2-fold axes (edge midpoints).
  // 31 = their union.
  var ICO_5FOLD = dedupeAntipodal(ICOSA);
  var ICO_3FOLD = faceCenterDirs(ICOSA);
  var ICO_2FOLD = edgeMidpointDirs(ICOSA);
  var ARRANGEMENTS = {
    ortho3: { label: "3 orthogonal circles", normals: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
    ico6: { label: "6 great circles (icosahedral)", normals: ICO_5FOLD },
    ico10: { label: "10 great circles (icosahedral)", normals: ICO_3FOLD },
    ico15: { label: "15 great circles (icosahedral)", normals: ICO_2FOLD },
    ico31: {
      label: "31 great circles (icosahedral)",
      normals: dedupeAntipodal([].concat(ICO_5FOLD, ICO_3FOLD, ICO_2FOLD))
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

  // ---- arc segmentation ---------------------------------------------------------
  // Closed interlocking rings cannot be assembled (each pair of great circles is
  // linked), so each ring is split into open arcs. Cuts are placed in the gaps
  // *between* crossings (never through a slot); each arc carries the slots that
  // fall within it. splitCount = 1 (open ring), 2 (half-circles, default), ...
  function splitIntoArcs(strip, splitCount) {
    var R = strip.circumference / (2 * Math.PI);
    var angles = strip.positions.map(function (p) { return p / R; }); // sorted asc
    var N = angles.length;
    var k = Math.max(1, Math.min(splitCount, N)); // can't have more cuts than gaps

    function gapMid(i) { // cut angle in the gap before crossing i (with wrap)
      var a0 = angles[(i - 1 + N) % N], a1 = angles[i % N];
      if (a1 <= a0) a1 += 2 * Math.PI;
      return (a0 + a1) / 2;
    }

    var arcs = [];
    for (var m = 0; m < k; m++) {
      var start = Math.round(m * N / k);
      var end = Math.round((m + 1) * N / k); // exclusive crossing index
      var a0 = gapMid(start);
      var a1 = gapMid(end); if (a1 <= a0) a1 += 2 * Math.PI;
      var slots = [];
      for (var c = start; c < end; c++) {
        var ang = angles[c % N]; while (ang < a0) ang += 2 * Math.PI;
        slots.push({ angle: ang, edge: c % 2 }); // edge parity from global index
      }
      arcs.push({ a0: a0, a1: a1, slots: slots });
    }
    return arcs;
  }

  // ---- SVG cutting template -----------------------------------------------------
  // Each great-circle strip is a radial wall on the sphere, so it flattens to a
  // curved ANNULAR piece: mean radius = sphere radius, width = strip width (it is
  // NOT a straight strip — paper cannot be bent into an in-plane arc). Rings are
  // split into open arcs (see splitIntoArcs) so the model can actually be woven
  // together. Slots are radial cuts at each crossing, alternating outer/inner edge
  // to half depth. Pieces are laid out in a grid.
  function stripsToSVG(model, opts) {
    opts = opts || {};
    var scaleF = opts.scale || 1;               // px per unit length (mm)
    var hpx = (opts.stripHeight || 8) * scaleF; // radial strip width
    var split = opts.split || 2;                // arcs per ring (2 = half-circles)
    var els = [];

    // collect every arc piece up front so we can grid-lay them
    var pieces = [];
    model.strips.forEach(function (strip) {
      splitIntoArcs(strip, split).forEach(function (arc, ai) {
        pieces.push({ strip: strip, arc: arc, label: "#" + strip.index + "." + ai });
      });
    });

    var R0 = model.strips.length ? model.strips[0].circumference / (2 * Math.PI) : 1;
    var ro = R0 * scaleF + hpx / 2, ri = R0 * scaleF - hpx / 2;
    var margin = 20, pad = Math.max(16, hpx * 1.5);
    var cell = 2 * ro + pad;
    var cols = Math.ceil(Math.sqrt(pieces.length));
    var rows = Math.ceil(pieces.length / cols);

    pieces.forEach(function (p, i) {
      var col = i % cols, row = Math.floor(i / cols);
      var cx = margin + col * cell + cell / 2;
      var cy = margin + row * cell + cell / 2;

      // annular-sector outline (both curved edges + the two radial end cuts)
      els.push(sector(cx, cy, ri, ro, p.arc.a0, p.arc.a1, "#0000ff"));

      // radial interlocking slots, alternating outer / inner edge to mid depth
      p.arc.slots.forEach(function (sl) {
        var fromR = (sl.edge === 0) ? ro : ri, toR = (ri + ro) / 2;
        var a = pt(cx, cy, fromR, sl.angle), b = pt(cx, cy, toR, sl.angle);
        els.push(seg(a[0], a[1], b[0], b[1], "#000000"));
      });

      var mid = (p.arc.a0 + p.arc.a1) / 2;
      var lp = pt(cx, cy, (ri + ro) / 2, mid);
      els.push(text(lp[0], lp[1], p.label));
    });

    var W = Math.ceil(cols * cell + 2 * margin), H = Math.ceil(rows * cell + 2 * margin);
    return [
      "<?xml version='1.0' encoding='utf-8'?>",
      "<svg xmlns='http://www.w3.org/2000/svg' width='" + W + "' height='" + H + "' viewBox='0 0 " + W + " " + H + "'>",
      "<style>line{stroke-width:1;fill:none}path{fill:none;stroke-width:1}text{font:10px sans-serif;fill:#333;text-anchor:middle}</style>",
      els.join(""),
      "</svg>"
    ].join("");

    function pt(cx, cy, rr, ang) { return [cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)]; }
    function sector(cx, cy, ri, ro, a0, a1, c) {
      var large = (a1 - a0) > Math.PI ? 1 : 0;
      var o0 = pt(cx, cy, ro, a0), o1 = pt(cx, cy, ro, a1);
      var i1 = pt(cx, cy, ri, a1), i0 = pt(cx, cy, ri, a0);
      var d = "M" + r(o0[0]) + " " + r(o0[1]) +
        "A" + r(ro) + " " + r(ro) + " 0 " + large + " 1 " + r(o1[0]) + " " + r(o1[1]) +
        "L" + r(i1[0]) + " " + r(i1[1]) +
        "A" + r(ri) + " " + r(ri) + " 0 " + large + " 0 " + r(i0[0]) + " " + r(i0[1]) + "Z";
      return "<path d='" + d + "' stroke='" + c + "'/>";
    }
    function seg(x1, y1, x2, y2, c) { return "<line x1='" + r(x1) + "' y1='" + r(y1) + "' x2='" + r(x2) + "' y2='" + r(y2) + "' stroke='" + c + "'/>"; }
    function text(x, yy, t) { return "<text x='" + r(x) + "' y='" + r(yy + 3) + "'>" + t + "</text>"; }
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
