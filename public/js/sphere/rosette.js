// Islamic star/rosette motif on polyhedron faces (Phase 2c) — pure math.
//
// Port of the flat app's rosette engine (patternModel.js: the "Star" and "Rosette"
// generators + makePatterns) to a single regular polygon face, then projected onto
// the sphere. Each motif is a set of n polylines, one per edge, connecting the
// midpoint of edge i to the midpoint of edge i+depth via a shaped template
// (Star = a V toward the centre; Rosette = a petal), symmetric and cropped at the
// two arms' intersection. This is what makes true rosettes instead of plain chords.
(function () {
  "use strict";

  var EPS = 1e-9;
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var L = len(a); return L < EPS ? [0, 0, 0] : [a[0] / L, a[1] / L, a[2] / L]; }

  function polar(r, t) { return [r * Math.cos(t), r * Math.sin(t)]; }

  // default contact angle (degrees) matching the flat app
  function defaultAngle(style, n) {
    return style === "rosette" ? 180 / n : 90 - 180 / (2 * n);
  }

  // template in unit-edge local coords (x along edge, y toward centre)
  function templateFor(style, n, angleDeg) {
    if (style === "rosette") {
      var theta = angleDeg / 180 * Math.PI;
      var rho = Math.PI / 2 - Math.PI * (n - 2) / (4 * n);
      var x = 0.5 * Math.sin(Math.PI * (n - 2) / (4 * n)) / Math.sin(Math.PI - Math.PI * (n - 2) / (4 * n) - theta);
      var y = 0.5 * Math.sin(Math.PI * (n - 2) / (2 * n)) / Math.sin(Math.PI / 2 - Math.PI * (n - 2) / (4 * n));
      return [polar(x, theta), polar(y, rho)];
    }
    // star
    var r = 1 / (2 * Math.tan(Math.PI / n));
    var th = (2 * angleDeg - 90) / 180 * Math.PI;
    return [[0 + r * Math.cos(th), r + r * Math.sin(th)]];
  }

  // effective depth cap from the template geometry (as the flat app computes)
  function maxDepth(style, n, angleDeg, template) {
    if (style === "star") return Math.floor(angleDeg * n / 180);
    var s = sub2(template[1], template[0]);
    var f = dot2(template[0], s) / dot2(s, s);
    var alpha = Math.atan2(s[1] * (1 + f), s[0] * (1 + f));
    return Math.floor(alpha * n / Math.PI);
  }
  function sub2(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function dot2(a, b) { return a[0] * b[0] + a[1] * b[1]; }

  // intersection of two infinite lines each given by two points (2D)
  function lineX(p1, p2, p3, p4) {
    var d1 = sub2(p2, p1), d2 = sub2(p4, p3);
    var den = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(den) < 1e-12) return [(p2[0] + p3[0]) / 2, (p2[1] + p3[1]) / 2];
    var t = ((p3[0] - p1[0]) * d2[1] - (p3[1] - p1[1]) * d2[0]) / den;
    return [p1[0] + t * d1[0], p1[1] + t * d1[1]];
  }

  // build the n motif polylines (2D) for a regular n-gon centred at origin
  function faceMotif2D(poly2D, style, angleDeg, depth) {
    var n = poly2D.length;
    var tmpl = templateFor(style, n, angleDeg);
    depth = Math.max(1, Math.min(depth, maxDepth(style, n, angleDeg, tmpl)));
    var mids = [], xhat = [], L = 0;
    for (var i = 0; i < n; i++) {
      var a = poly2D[i], b = poly2D[(i + 1) % n];
      mids.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      var e = sub2(b, a); L = Math.hypot(e[0], e[1]);
      xhat.push([e[0] / L, e[1] / L]);
    }
    // place a template on edge i's midpoint; y points toward the centre (origin)
    function place(i, flip) {
      var C = mids[i], yh = [-C[0], -C[1]]; var yl = Math.hypot(yh[0], yh[1]); yh = [yh[0] / yl, yh[1] / yl];
      return tmpl.map(function (t) {
        var tx = (flip ? -t[0] : t[0]) * L, ty = t[1] * L;
        return [C[0] + tx * xhat[i][0] + ty * yh[0], C[1] + tx * xhat[i][1] + ty * yh[1]];
      });
    }
    var out = [];
    for (var j = 0; j < n; j++) {
      var ei = j, ej = (j + depth) % n;
      var Cs = mids[ei], Ce = mids[ej];
      var fromStart = place(ei, false), fromEnd = place(ej, true);
      var sSeg = fromStart.length > 1 ? [fromStart[fromStart.length - 2], fromStart[fromStart.length - 1]] : [Cs, fromStart[0]];
      var eSeg = fromEnd.length > 1 ? [fromEnd[fromEnd.length - 2], fromEnd[fromEnd.length - 1]] : [Ce, fromEnd[0]];
      var center = lineX(sSeg[0], sSeg[1], eSeg[0], eSeg[1]);
      var internal = fromStart.slice(0, -1).concat([center]).concat(fromEnd.slice().reverse().slice(1));
      out.push([Cs].concat(internal).concat([Ce]));
    }
    return out;
  }

  function build(solidName, opts) {
    opts = opts || {};
    var R = opts.radius || 1;
    var style = opts.style || "rosette";
    var SP = window.SpherePattern;
    var verts = SP.POLYHEDRA[solidName].verts;
    var faces = SP.extractFaces(verts);

    var motifs = [];
    faces.forEach(function (f) {
      var fv = f.map(function (k) { return verts[k]; });
      var O = scale(fv.reduce(function (s, p) { return add(s, p); }, [0, 0, 0]), 1 / fv.length);
      var nrm = unit(cross(sub(fv[1], fv[0]), sub(fv[2], fv[0])));
      if (dot(nrm, O) < 0) nrm = scale(nrm, -1);
      var u = unit(sub(fv[0], O)), v = cross(nrm, u);
      var poly2D = fv.map(function (p) { var w = sub(p, O); return [dot(w, u), dot(w, v)]; });
      var n = fv.length;
      var angle = (opts.angleDeg != null) ? opts.angleDeg : defaultAngle(style, n);
      faceMotif2D(poly2D, style, angle, opts.depth || (n > 4 ? 2 : 1)).forEach(function (poly) {
        // 2D face coords -> 3D on the face plane -> radial projection to sphere
        motifs.push(poly.map(function (q) {
          return scale(unit(add(O, add(scale(u, q[0]), scale(v, q[1])))), R);
        }));
      });
    });

    var edges = SP.extractFaces ? edgeList(verts, faces) : [];
    return { motifs: motifs, faces: faces, verts: verts.map(unit), edges: edges };
  }

  function edgeList(verts, faces) {
    var seen = {}, out = [];
    faces.forEach(function (f) {
      for (var i = 0; i < f.length; i++) {
        var a = f[i], b = f[(i + 1) % f.length], key = Math.min(a, b) + "_" + Math.max(a, b);
        if (seen[key]) continue; seen[key] = 1;
        out.push([unit(verts[a]), unit(verts[b])]);
      }
    });
    return out;
  }

  window.SphereRosette = {
    build: build,
    defaultAngle: defaultAngle,
    templateFor: templateFor,
    maxDepth: maxDepth,
    faceMotif2D: faceMotif2D
  };
})();
