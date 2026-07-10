# Spherical sliceform — physical prototypes

Print-ready cutting templates for building a spherical sliceform by hand, plus the
tolerances to tune between test builds.

## Recommended first build: `icosidodecahedron-rosette.svg`

Chosen because its weave is **perfect** — every crossing interlocks *and* every
strip alternates over/under with **0 weave conflicts**, so it locks together
cleanly. It's a ~100 mm sphere made of **12 strips**, each cut into 2 arcs
(**24 pieces total**), following a rosette pattern.

The SVG is authored at **true scale (1 unit = 1 mm)**. The whole template is about
**755 × 789 mm**, so it does not fit one sheet — see *Printing* below.

## What the lines mean
- **Coloured outline** — cut it out. **Same colour = one strip** (its 2 arcs).
- **Black slot** — cut this notch. It's cut from the outer *or* inner edge to the
  mid-line (alternating), and the crossing strip slides into it.
- **Red line** — a fold/score at a **glue tab**. Fold there and glue the tab under
  the next arc of the same strip to reconnect that strip's loop.
- **Label** `#s.a/k` — strip `s`, arc `a` of `k`. Join a strip's arcs in order.

## Printing
1. Open the SVG and **print at 100% / true scale** (do not "fit to page").
2. It spans several sheets — use your PDF/print dialog's **"Tile / Poster"**
   option (or a print shop / large-format printer). Trim and butt the tiles.
3. Use **card stock ~0.3 mm** (matches the default slot width). Heavier card holds
   the sphere better; if you change thickness, regenerate (see *Tuning*).

## Assembly
1. Cut every piece and its slots. Keep strips grouped by colour.
2. For each strip, glue its arcs at the red tabs to reform the strip (a closed
   loop — it will not lie flat; the built-in curvature is intentional).
3. Interlock strips by sliding matching slots together (outer-edge slot of one
   strip into the inner-edge slot of the other). Work outward from one crossing.
4. Because the weave alternates, the pieces lock progressively into a sphere.

## Tuning (the prototype loop)
Regenerate from the sandbox (`/sphere.html` → pattern mode → *Export*) or the
one-liner below, adjusting:

- **Material (mm)** — set to your actual card thickness. Slot width = thickness +
  0.15 mm clearance. If slots are **too tight**, raise it; **too loose**, lower it.
- **Radius (mm)** — sphere size (template area grows with it).
- **Strip width (mm)** — how tall the walls stand (and the slot depth = half of it).
- **Cut strip into** — more arcs = smaller, flatter pieces (easier to cut, more
  joins).

```
node -e 'global.window={};["pattern","rosette","patternstrips"].forEach(m=>require("./public/js/sphere/"+m+".js"));
var B=window.SpherePatternStrips,fs=require("fs");
var m=B.build("icosidodecahedron",{radius:50,style:"rosette",depth:2});
fs.writeFileSync("docs/prototypes/icosidodecahedron-rosette.svg",
  B.stripsToSVG(m,{scale:1,stripHeight:9,split:2,materialThickness:0.3,title:"icosidodecahedron (rosette)"}));'
```

Known tolerance caveat to test first: slot width is sized for a **perpendicular**
crossing. Where two strips meet at an oblique angle the effective opening is
narrower, so if some crossings bind, increase **Material (mm)** slightly.
