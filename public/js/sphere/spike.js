// Spherical-sliceform sandbox (Phase 0 + Phase 1).
//
// Phase 0: draw a Platonic solid's edges as great-circle arcs on a sphere.
// Phase 1: draw a great-circle arrangement as an interlocking strip sphere,
//          mark the crossings, report stats, and export flattened cutting strips.
//
// Uses the global THREE (r134 UMD) and window.SphereGeom (geometry.js). No modules.

(function () {
  "use strict";

  var R = 1;                 // preview sphere radius (unit)
  var PHI = (1 + Math.sqrt(5)) / 2;
  var G = window.SphereGeom;

  // ---- Platonic solids (Phase 0) ------------------------------------------------
  function s(coords) {
    var out = [], idx = [];
    for (var i = 0; i < 3; i++) if (coords[i] !== 0) idx.push(i);
    for (var m = 0; m < (1 << idx.length); m++) {
      var v = coords.slice();
      for (var b = 0; b < idx.length; b++) if (m & (1 << b)) v[idx[b]] = -v[idx[b]];
      out.push(v);
    }
    return out;
  }
  function cyc(c) { return dedupe([].concat(s([c[0], c[1], c[2]]), s([c[2], c[0], c[1]]), s([c[1], c[2], c[0]]))); }
  function dedupe(vs) {
    var out = [];
    vs.forEach(function (v) { if (!out.some(function (w) { return d3dist(v, w) < 1e-9; })) out.push(v); });
    return out;
  }
  function d3dist(a, b) { var x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return Math.sqrt(x * x + y * y + z * z); }

  var SOLIDS = {
    tetrahedron: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
    cube: s([1, 1, 1]),
    octahedron: cyc([1, 0, 0]),
    icosahedron: cyc([0, 1, PHI]),
    dodecahedron: s([1, 1, 1]).concat(cyc([0, 1 / PHI, PHI]))
  };

  function normalizeTo(v, radius) {
    var L = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    return [v[0] / L * radius, v[1] / L * radius, v[2] / L * radius];
  }
  function edgesOf(verts) {
    var min = Infinity, i, j, d;
    for (i = 0; i < verts.length; i++) for (j = i + 1; j < verts.length; j++) { d = d3dist(verts[i], verts[j]); if (d > 1e-6 && d < min) min = d; }
    var out = [];
    for (i = 0; i < verts.length; i++) for (j = i + 1; j < verts.length; j++) if (d3dist(verts[i], verts[j]) <= min * 1.02) out.push([i, j]);
    return out;
  }
  function arcPoints(a, b, seg) {
    var ua = new THREE.Vector3(a[0], a[1], a[2]).normalize();
    var ub = new THREE.Vector3(b[0], b[1], b[2]).normalize();
    var omega = Math.acos(Math.max(-1, Math.min(1, ua.dot(ub))));
    if (omega < 1e-6) return [ua.multiplyScalar(R), ub.multiplyScalar(R)];
    var sinO = Math.sin(omega), pts = [];
    for (var i = 0; i <= seg; i++) {
      var t = i / seg, s1 = Math.sin((1 - t) * omega) / sinO, s2 = Math.sin(t * omega) / sinO;
      pts.push(new THREE.Vector3((ua.x * s1 + ub.x * s2) * R, (ua.y * s1 + ub.y * s2) * R, (ua.z * s1 + ub.z * s2) * R));
    }
    return pts;
  }

  // ---- three.js scene -----------------------------------------------------------
  var container = document.getElementById("sphereCanvas");
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf7f7f7);
  var camera = new THREE.PerspectiveCamera(50, aspect(), 0.1, 100);
  camera.position.set(0, 0, 3.3 * R);
  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);
  var controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  var dir = new THREE.DirectionalLight(0xffffff, 0.6); dir.position.set(4, 5, 6); scene.add(dir);
  var group = new THREE.Group(); scene.add(group);

  var sphereMesh = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.99, 48, 48),
    new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, shininess: 5 }));
  var edgeMat = new THREE.MeshPhongMaterial({ color: 0x1f6feb, shininess: 30 });
  var vertMat = new THREE.MeshPhongMaterial({ color: 0x24292f });
  var simpleMat = new THREE.MeshPhongMaterial({ color: 0x2ea043 });   // simple crossing
  var multiMat = new THREE.MeshPhongMaterial({ color: 0xd1242f });    // multi-way junction

  function aspect() { return container.clientWidth / container.clientHeight; }
  function clearGroup() {
    for (var i = group.children.length - 1; i >= 0; i--) {
      var c = group.children[i]; group.remove(c);
      if (c.geometry && c !== sphereMesh) c.geometry.dispose();
    }
  }

  // ---- Phase 0: polyhedron edges ------------------------------------------------
  function renderSolid(name) {
    clearGroup();
    if (document.getElementById("showSphere").checked) group.add(sphereMesh);
    var verts = SOLIDS[name].map(function (v) { return normalizeTo(v, R); });
    edgesOf(verts).forEach(function (e) {
      var tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arcPoints(verts[e[0]], verts[e[1]], 48)), 48, 0.013 * R, 8, false);
      group.add(new THREE.Mesh(tube, edgeMat));
    });
    verts.forEach(function (v) {
      var m = new THREE.Mesh(new THREE.SphereGeometry(0.028 * R, 16, 16), vertMat);
      m.position.set(v[0], v[1], v[2]); group.add(m);
    });
    document.getElementById("gcPanel").style.display = "none";
  }

  // ---- Phase 1: great-circle strips ---------------------------------------------
  var currentModel = null; // last built SphereGeom model (for export)

  function renderGreatCircles(key) {
    clearGroup();
    if (document.getElementById("showSphere").checked) group.add(sphereMesh);
    var arr = G.ARRANGEMENTS[key];

    // one tube-torus per great circle, oriented so its plane is perpendicular to n
    var zAxis = new THREE.Vector3(0, 0, 1);
    arr.normals.forEach(function (n) {
      var torus = new THREE.Mesh(new THREE.TorusGeometry(R, 0.011 * R, 8, 128), edgeMat);
      torus.quaternion.setFromUnitVectors(zAxis, new THREE.Vector3(n[0], n[1], n[2]).normalize());
      group.add(torus);
    });

    var cr = G.computeCrossings(arr.normals, R);
    if (document.getElementById("showCrossings").checked) {
      cr.clusters.forEach(function (cl) {
        var multi = cl.circles.length > 2;
        var m = new THREE.Mesh(new THREE.SphereGeometry((multi ? 0.05 : 0.03) * R, 16, 16), multi ? multiMat : simpleMat);
        m.position.set(cl.pos[0], cl.pos[1], cl.pos[2]); group.add(m);
      });
    }

    currentModel = G.buildStrips(key, +document.getElementById("radius").value);
    var multiPts = cr.clusters.filter(function (c) { return c.circles.length > 2; }).length;
    var totalSlots = currentModel.strips.reduce(function (a, s2) { return a + s2.positions.length; }, 0);
    document.getElementById("stats").innerHTML =
      "<b>" + arr.normals.length + "</b> circles &middot; " +
      "<b>" + cr.clusters.length + "</b> crossings (" +
      "<span style='color:#2ea043'>" + (cr.clusters.length - multiPts) + " simple</span>, " +
      "<span style='color:#d1242f'>" + multiPts + " multi-way</span>) &middot; " +
      "<b>" + totalSlots + "</b> slots total";
    document.getElementById("gcPanel").style.display = "block";
  }

  // ---- Phase 2b: traced pattern sliceform ---------------------------------------
  var faintMat = new THREE.MeshBasicMaterial({ color: 0xcccccc });
  var patSolid = null;

  function stripColor(i, n) { var c = new THREE.Color(); c.setHSL((i / n) % 1, 0.62, 0.55); return c; }

  function renderPattern(name) {
    clearGroup();
    patSolid = name;
    if (document.getElementById("showSphere").checked) group.add(sphereMesh);
    var skip = +document.getElementById("skip").value;
    var style = document.getElementById("motifStyle").value;
    var m = window.SpherePatternStrips.build(name, { radius: R, depth: skip, style: style, angles: currentAngles() });

    // faint base-polyhedron edges for reference
    var seen = {};
    m.faces.forEach(function (f) {
      for (var i = 0; i < f.length; i++) {
        var a = f[i], b = f[(i + 1) % f.length], key = Math.min(a, b) + "_" + Math.max(a, b);
        if (seen[key]) continue; seen[key] = 1;
        var arc = arcPoints(scaleV(m.verts[a], R), scaleV(m.verts[b], R), 24);
        group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arc), 24, 0.003 * R, 5, false), faintMat));
      }
    });

    // draw the actual pattern chords (sharp star shapes). The chords ARE the
    // visible star motif on each face; colour by strip only when requested (that
    // fragments each face's star, so it is off by default).
    var byStrip = document.getElementById("colorByStrip").checked;
    var mats = m.strips.map(function (_, si) {
      return new THREE.MeshPhongMaterial({ color: stripColor(si, m.strips.length), shininess: 30 });
    });
    var oneMat = new THREE.MeshPhongMaterial({ color: 0x8250df, shininess: 30 });
    m.chords.forEach(function (c) {
      var pts = c.poly3.map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); });
      if (pts.length < 2) return;
      group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 4, 0.016 * R, 8, false), byStrip ? mats[c.strip || 0] : oneMat));
    });

    // crossing markers
    if (document.getElementById("showCrossings").checked) {
      m.crossings.forEach(function (x) {
        var mk = new THREE.Mesh(new THREE.SphereGeometry(0.02 * R, 12, 12), simpleMat);
        mk.position.set(x.pos[0], x.pos[1], x.pos[2]); group.add(mk);
      });
    }

    document.getElementById("gcPanel").style.display = "none";
    document.getElementById("patPanel").style.display = "block";
    document.getElementById("patStats").innerHTML =
      "<b>" + m.stripCount + "</b> strips &middot; <b>" + m.crossings.length + "</b> crossings &middot; <b>" +
      m.chords.length + "</b> chords &middot; weave: all interlock" +
      (m.weaveConflicts ? ", <span style='color:#d1242f'>" + m.weaveConflicts + " non-alternating</span>" : " &amp; fully alternating");
  }

  function scaleV(v, s) { return [v[0] * s, v[1] * s, v[2] * s]; }

  function patternExport() {
    var model = window.SpherePatternStrips.build(patSolid, {
      radius: +document.getElementById("patRadius").value,
      depth: +document.getElementById("skip").value,
      style: document.getElementById("motifStyle").value,
      angles: currentAngles()
    });
    var svg = window.SpherePatternStrips.stripsToSVG(model, {
      scale: 1, stripHeight: +document.getElementById("patStripHeight").value,
      split: +document.getElementById("patSplit").value,
      materialThickness: +document.getElementById("patThickness").value,
      title: patSolid + " (" + document.getElementById("motifStyle").value + ")"
    });
    var blob = new Blob([svg], { type: "image/svg+xml" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "spherical_pattern_" + patSolid + "_strips.svg";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // distinct face sizes of a solid (a mixed Archimedean solid gets one control each)
  function faceSizes(solidName) {
    var seen = {};
    window.SpherePattern.extractFaces(window.SpherePattern.POLYHEDRA[solidName].verts)
      .forEach(function (f) { seen[f.length] = 1; });
    return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
  }
  function angleRange(style, n) {
    return style === "star"
      ? { min: 180 / n, max: 90, def: 90 - 180 / (2 * n) }
      : { min: 1, max: 90 - 45 * (n - 2) / n, def: 180 / n };
  }
  // (re)build one contact-angle slider per face size of the current solid+motif
  function buildAngleControls(style, sizes) {
    var host = document.getElementById("angleControls");
    host.innerHTML = "";
    sizes.forEach(function (n) {
      var rng = angleRange(style, n);
      var group = document.createElement("span");
      group.className = "form-group";
      group.style.marginRight = "22px";
      var label = document.createElement("label");
      label.style.marginRight = "6px";
      label.textContent = n + "-gon angle";
      var input = document.createElement("input");
      input.type = "range"; input.id = "angle_" + n; input.dataset.n = n;
      input.min = rng.min.toFixed(1); input.max = rng.max.toFixed(1); input.step = "0.5";
      input.value = rng.def.toFixed(1); input.style.verticalAlign = "middle"; input.style.width = "150px";
      var val = document.createElement("span");
      val.className = "text-muted"; val.id = "angleVal_" + n;
      val.style.marginLeft = "6px"; val.textContent = (+input.value).toFixed(1) + "°";
      input.addEventListener("input", function () { val.textContent = (+input.value).toFixed(1) + "°"; draw(); });
      group.appendChild(label); group.appendChild(input); group.appendChild(val);
      host.appendChild(group);
    });
  }
  // read the per-face-size angles into a map { n: degrees }
  function currentAngles() {
    var out = {};
    Array.prototype.forEach.call(document.querySelectorAll("#angleControls input"), function (el) {
      out[+el.dataset.n] = +el.value;
    });
    return out;
  }

  // ---- dispatch + wiring --------------------------------------------------------
  function draw() {
    var val = document.getElementById("modelSelect").value;
    var parts = val.split(":");
    if (parts[0] === "solid") { renderSolid(parts[1]); document.getElementById("patPanel").style.display = "none"; }
    else if (parts[0] === "pat") renderPattern(parts[1]);
    else { renderGreatCircles(parts[1]); document.getElementById("patPanel").style.display = "none"; }
  }

  // when the solid or motif changes, rebuild the per-face-size angle controls
  function drawResettingAngle() {
    var parts = document.getElementById("modelSelect").value.split(":");
    if (parts[0] === "pat") buildAngleControls(document.getElementById("motifStyle").value, faceSizes(parts[1]));
    draw();
  }

  function exportSVG() {
    var key = document.getElementById("modelSelect").value.split(":")[1];
    var radius = +document.getElementById("radius").value;
    var model = G.buildStrips(key, radius);
    var svg = G.stripsToSVG(model, {
      scale: 1,
      stripHeight: +document.getElementById("stripHeight").value,
      split: +document.getElementById("splitCount").value
    });
    var blob = new Blob([svg], { type: "image/svg+xml" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "spherical_" + key + "_strips.svg";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  document.getElementById("modelSelect").addEventListener("change", drawResettingAngle);
  document.getElementById("showSphere").addEventListener("change", draw);
  document.getElementById("showCrossings").addEventListener("change", draw);
  document.getElementById("radius").addEventListener("change", draw);
  document.getElementById("skip").addEventListener("change", draw);
  document.getElementById("motifStyle").addEventListener("change", drawResettingAngle);
  document.getElementById("patRadius").addEventListener("change", draw);
  document.getElementById("colorByStrip").addEventListener("change", draw);
  document.getElementById("exportBtn").addEventListener("click", exportSVG);
  document.getElementById("patExportBtn").addEventListener("click", patternExport);
  window.addEventListener("resize", function () {
    camera.aspect = aspect(); camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  (function animate() { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); })();
  draw();
})();
