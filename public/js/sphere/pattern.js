// Spherical Islamic-pattern generation (Phase 2a) — pure math, no THREE / no DOM.
//
// Takes a base polyhedron, builds a star motif on each (flat) face using Hankin's
// polygons-in-contact method, then radially projects the motif onto the sphere.
// Because every face places its motif's contact points at shared edge midpoints
// with the same contact angle, the motif lines join across edges into continuous
// curves over the whole sphere — the substrate for the pattern strips.
(function () {
  "use strict";

  var PHI = (1 + Math.sqrt(5)) / 2;
  var EPS = 1e-6;

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var L = len(a); return L < EPS ? [0, 0, 0] : [a[0] / L, a[1] / L, a[2] / L]; }
  function dist(a, b) { return len(sub(a, b)); }

  // ---- polyhedra ----------------------------------------------------------------
  function signs(c) {
    var out = [], idx = [];
    for (var i = 0; i < 3; i++) if (c[i] !== 0) idx.push(i);
    for (var m = 0; m < (1 << idx.length); m++) {
      var v = c.slice();
      for (var b = 0; b < idx.length; b++) if (m & (1 << b)) v[idx[b]] = -v[idx[b]];
      out.push(v);
    }
    return out;
  }
  function cyc(c) {
    return dedupe([].concat(signs([c[0], c[1], c[2]]), signs([c[2], c[0], c[1]]), signs([c[1], c[2], c[0]])));
  }
  function dedupe(vs) {
    var out = [];
    vs.forEach(function (v) { if (!out.some(function (w) { return dist(v, w) < 1e-9; })) out.push(v); });
    return out;
  }

  var POLYHEDRA = {
    tetrahedron: { label: "Tetrahedron", verts: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]] },
    cube: { label: "Cube", verts: signs([1, 1, 1]) },
    octahedron: { label: "Octahedron", verts: cyc([1, 0, 0]) },
    icosahedron: { label: "Icosahedron", verts: cyc([0, 1, PHI]) },
    dodecahedron: { label: "Dodecahedron", verts: signs([1, 1, 1]).concat(cyc([0, 1 / PHI, PHI])) }
  };

  // min-distance edges
  function edgesOf(verts) {
    var min = Infinity, i, j, d;
    for (i = 0; i < verts.length; i++) for (j = i + 1; j < verts.length; j++) { d = dist(verts[i], verts[j]); if (d > EPS && d < min) min = d; }
    var out = [];
    for (i = 0; i < verts.length; i++) for (j = i + 1; j < verts.length; j++) if (dist(verts[i], verts[j]) <= min * 1.02) out.push([i, j]);
    return out;
  }

  // Extract polygon faces of a convex polyhedron via supporting planes: a face is
  // the set of vertices lying on a plane with all other vertices strictly inside.
  function extractFaces(verts) {
    var E = edgesOf(verts), adj = verts.map(function () { return []; });
    E.forEach(function (e) { adj[e[0]].push(e[1]); adj[e[1]].push(e[0]); });
    var faces = [], seen = {};
    E.forEach(function (e) {
      var a = e[0], b = e[1];
      adj[a].forEach(function (c) {
        if (c === b) return;
        var n = unit(cross(sub(verts[b], verts[a]), sub(verts[c], verts[a])));
        if (len(n) < EPS) return;
        if (dot(n, verts[a]) < 0) n = scale(n, -1);          // outward
        var d = dot(n, verts[a]);
        if (!verts.every(function (v) { return dot(n, v) <= d + 1e-6; })) return; // supporting?
        var idx = [];
        verts.forEach(function (v, k) { if (Math.abs(dot(n, v) - d) < 1e-6) idx.push(k); });
        var key = idx.slice().sort(function (x, y) { return x - y; }).join(",");
        if (seen[key]) return;
        seen[key] = 1;
        faces.push(orderFace(idx, n, verts));
      });
    });
    return faces;
  }

  // order a face's vertices cyclically about its centroid
  function orderFace(idx, n, verts) {
    var O = scale(idx.reduce(function (s, k) { return add(s, verts[k]); }, [0, 0, 0]), 1 / idx.length);
    var u = unit(sub(verts[idx[0]], O)), v = cross(n, u);
    return idx.slice().sort(function (p, q) {
      return Math.atan2(dot(sub(verts[p], O), v), dot(sub(verts[p], O), u)) -
        Math.atan2(dot(sub(verts[q], O), v), dot(sub(verts[q], O), u));
    });
  }

  // ---- Hankin star motif on one face --------------------------------------------
  // Returns a closed motif polyline (array of sphere-projected 3D points).
  function faceMotif(idx, verts, R, thetaRad, samples) {
    var fv = idx.map(function (k) { return verts[k]; });
    var k = fv.length;
    var O = scale(fv.reduce(function (s, p) { return add(s, p); }, [0, 0, 0]), 1 / k);
    var n = unit(cross(sub(fv[1], fv[0]), sub(fv[2], fv[0])));
    if (dot(n, O) < 0) n = scale(n, -1);
    var u = unit(sub(fv[0], O)), v = cross(n, u);
    var to2 = function (p) { var w = sub(p, O); return [dot(w, u), dot(w, v)]; };
    var from2 = function (q) { return add(O, add(scale(u, q[0]), scale(v, q[1]))); };

    // edge midpoints + the two inward rays (Hankin: angle theta to the edge)
    var mids = [], raysCW = [], raysCCW = [];
    for (var i = 0; i < k; i++) {
      var A = to2(fv[i]), B = to2(fv[(i + 1) % k]);
      var m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
      var t = norm2([B[0] - A[0], B[1] - A[1]]);      // edge tangent
      var nin = norm2([-m[0], -m[1]]);                // inward (toward centre O=origin)
      var ct = Math.cos(thetaRad), st = Math.sin(thetaRad);
      mids.push(m);
      raysCCW.push(norm2([ct * t[0] + st * nin[0], ct * t[1] + st * nin[1]]));   // leans +t
      raysCW.push(norm2([-ct * t[0] + st * nin[0], -ct * t[1] + st * nin[1]]));  // leans -t
    }

    // each interior point = intersection of edge i's +t ray with edge i+1's -t ray
    var pts2 = [];
    for (var e = 0; e < k; e++) {
      var j = (e + 1) % k;
      var X = intersect(mids[e], raysCCW[e], mids[j], raysCW[j]);
      pts2.push(mids[e]);
      if (X) pts2.push(X);
    }

    // close the loop, densify each segment, map to 3D and project onto the sphere
    var loop = pts2.concat([pts2[0]]);
    var out = [];
    for (var s = 0; s < loop.length - 1; s++) {
      for (var g = 0; g < samples; g++) {
        var f = g / samples;
        var q = [loop[s][0] + (loop[s + 1][0] - loop[s][0]) * f, loop[s][1] + (loop[s + 1][1] - loop[s][1]) * f];
        out.push(scale(unit(from2(q)), R));
      }
    }
    out.push(out[0]);
    return out;
  }

  function norm2(a) { var L = Math.hypot(a[0], a[1]); return L < EPS ? [0, 0] : [a[0] / L, a[1] / L]; }
  function intersect(p1, d1, p2, d2) {
    var den = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(den) < 1e-9) return null;
    var s = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den;
    return [p1[0] + s * d1[0], p1[1] + s * d1[1]];
  }

  // ---- assemble a spherical pattern ---------------------------------------------
  function buildPattern(solidName, opts) {
    opts = opts || {};
    var R = opts.radius || 1;
    var theta = (opts.contactAngleDeg || 30) * Math.PI / 180;
    var samples = opts.samples || 10;
    var verts = POLYHEDRA[solidName].verts;
    var faces = extractFaces(verts);
    var motifs = faces.map(function (f) { return faceMotif(f, verts, R, theta, samples); });
    var edges = edgesOf(verts).map(function (e) { return [unit(verts[e[0]]), unit(verts[e[1]])]; });
    return { faces: faces, verts: verts.map(unit), edges: edges, motifs: motifs };
  }

  window.SpherePattern = {
    POLYHEDRA: POLYHEDRA,
    extractFaces: extractFaces,
    buildPattern: buildPattern
  };
})();
