// Phase 0 spike for the spherical-sliceform feature.
//
// Renders a Platonic solid projected onto a sphere: vertices are placed on the
// sphere and each polyhedron edge is drawn as the great-circle arc between its
// endpoints. This validates the 3D substrate (three.js + orbit preview) that the
// full spherical mode will build on. Deliberately standalone — no dependency on
// the existing 2D app code.

(function () {
  "use strict";

  var R = 1; // sphere radius (unit sphere)
  var PHI = (1 + Math.sqrt(5)) / 2;

  // ---- polyhedron vertex sets (unnormalised; each solid's verts are equidistant
  // from the origin, so we normalise onto the sphere before drawing) -------------
  function s(signs, coords) {
    // expand all sign combinations of the non-zero coordinates
    var out = [];
    var idxs = [];
    for (var i = 0; i < coords.length; i++) if (coords[i] !== 0) idxs.push(i);
    var n = idxs.length;
    for (var m = 0; m < (1 << n); m++) {
      var v = coords.slice();
      for (var b = 0; b < n; b++) if (m & (1 << b)) v[idxs[b]] = -v[idxs[b]];
      out.push(v);
    }
    return out;
  }

  function cyclic(coords) {
    // three cyclic rotations of a coordinate triple, each with all sign combos
    var rots = [
      [coords[0], coords[1], coords[2]],
      [coords[2], coords[0], coords[1]],
      [coords[1], coords[2], coords[0]]
    ];
    var out = [];
    rots.forEach(function (r) { out = out.concat(s(null, r)); });
    return dedupe(out);
  }

  function dedupe(verts) {
    var out = [];
    verts.forEach(function (v) {
      if (!out.some(function (w) {
        return Math.abs(w[0] - v[0]) < 1e-9 && Math.abs(w[1] - v[1]) < 1e-9 && Math.abs(w[2] - v[2]) < 1e-9;
      })) out.push(v);
    });
    return out;
  }

  var SOLIDS = {
    tetrahedron: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
    cube: s(null, [1, 1, 1]),
    octahedron: cyclic([1, 0, 0]),
    icosahedron: cyclic([0, 1, PHI]),
    dodecahedron: s(null, [1, 1, 1])
      .concat(cyclic([0, 1 / PHI, PHI]))
  };

  // ---- geometry helpers ---------------------------------------------------------
  function normalize(v) {
    var L = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    return [v[0] / L * R, v[1] / L * R, v[2] / L * R];
  }

  // edges = the vertex pairs at the minimum (i.e. edge) distance
  function edgesFromVertices(verts) {
    var min = Infinity, i, j, d;
    for (i = 0; i < verts.length; i++)
      for (j = i + 1; j < verts.length; j++) {
        d = dist(verts[i], verts[j]);
        if (d > 1e-6 && d < min) min = d;
      }
    var edges = [];
    for (i = 0; i < verts.length; i++)
      for (j = i + 1; j < verts.length; j++)
        if (dist(verts[i], verts[j]) <= min * 1.02) edges.push([i, j]);
    return edges;
  }

  function dist(a, b) {
    var dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // great-circle arc (slerp) between two points already on the sphere
  function greatCircleArc(a, b, segments) {
    var ua = new THREE.Vector3(a[0], a[1], a[2]).normalize();
    var ub = new THREE.Vector3(b[0], b[1], b[2]).normalize();
    var omega = Math.acos(Math.max(-1, Math.min(1, ua.dot(ub))));
    var pts = [];
    if (omega < 1e-6) return [ua.multiplyScalar(R), ub.multiplyScalar(R)];
    var sinO = Math.sin(omega);
    for (var i = 0; i <= segments; i++) {
      var t = i / segments;
      var s1 = Math.sin((1 - t) * omega) / sinO;
      var s2 = Math.sin(t * omega) / sinO;
      pts.push(new THREE.Vector3(
        (ua.x * s1 + ub.x * s2) * R,
        (ua.y * s1 + ub.y * s2) * R,
        (ua.z * s1 + ub.z * s2) * R
      ));
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
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  var dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(4, 5, 6);
  scene.add(dir);

  var group = new THREE.Group();
  scene.add(group);

  var sphereMesh = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.99, 48, 48),
    new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, shininess: 5 })
  );

  var edgeMat = new THREE.MeshPhongMaterial({ color: 0x1f6feb, shininess: 30 });
  var vertMat = new THREE.MeshPhongMaterial({ color: 0x24292f });

  function aspect() { return container.clientWidth / container.clientHeight; }

  function clearGroup() {
    for (var i = group.children.length - 1; i >= 0; i--) {
      var c = group.children[i];
      group.remove(c);
      if (c.geometry && c !== sphereMesh) c.geometry.dispose();
    }
  }

  function render(name) {
    clearGroup();

    if (document.getElementById("showSphere").checked) group.add(sphereMesh);

    var verts = SOLIDS[name].map(normalize);
    var edges = edgesFromVertices(verts);

    edges.forEach(function (e) {
      var arc = greatCircleArc(verts[e[0]], verts[e[1]], 48);
      var curve = new THREE.CatmullRomCurve3(arc);
      var tube = new THREE.TubeGeometry(curve, 48, 0.013 * R, 8, false);
      group.add(new THREE.Mesh(tube, edgeMat));
    });

    if (document.getElementById("showVertices").checked) {
      verts.forEach(function (v) {
        var m = new THREE.Mesh(new THREE.SphereGeometry(0.028 * R, 16, 16), vertMat);
        m.position.set(v[0], v[1], v[2]);
        group.add(m);
      });
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  // ---- wiring -------------------------------------------------------------------
  function current() { return document.getElementById("solidSelect").value; }
  function rerender() { render(current()); }

  document.getElementById("solidSelect").addEventListener("change", rerender);
  document.getElementById("showSphere").addEventListener("change", rerender);
  document.getElementById("showVertices").addEventListener("change", rerender);

  window.addEventListener("resize", function () {
    camera.aspect = aspect();
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  render("dodecahedron");
  animate();
})();
