/**
 * The "House over warehouse" concept model, ported from the reference
 * three.js r128 page (house-warehouse-3d.html, built from Revision 04).
 *
 * Geometry, materials, lights and camera presets are kept as in the reference
 * so the port renders identically; only the DOM wiring and the lifecycle
 * (resize, visibility, disposal) were adapted for an Angular host. three is
 * pinned to 0.128.0 because later releases change colour-space and light
 * intensity defaults, which would alter the look.
 *
 * This module is loaded with a dynamic import, in the browser only.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { ViewName } from './model-views';

export interface HouseScene {
  goTo(view: ViewName): void;
  setLabels(on: boolean): void;
  setNeighbours(on: boolean): void;
  setEvening(on: boolean): void;
  dispose(): void;
}

type Group = THREE.Group & { userData: { fl?: number } };
type Point = readonly [number, number];
/** Wall opening: [start, end, sill, head]. */
type Opening = readonly [number, number, number, number];

/** Plan coords: x 0..9 left→right seen from street, z 0 street → 17 garden, y up. */
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, -z);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const rect = (x0: number, z0: number, x1: number, z1: number): Point[] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];

/* ---------- levels ---------- */
const H1 = 3.5; // upper floor finished level
const SLAB = 0.25; // slab thickness
const W1 = H1 - SLAB; // top of ground-floor walls
const H2 = H1 + 2.9; // underside of roof slab
const ROOF = H2 + 0.25; // roof top
const PARA = ROOF + 0.55; // parapet top

const INSIDE_VIEWS: readonly ViewName[] = [
  'living',
  'kitchen',
  'bedroom',
  'lobby',
  'garage',
  'terrace',
];

const LABEL_CLASS =
  'pointer-events-none absolute top-0 left-0 hidden -translate-x-1/2 -translate-y-1/2 ' +
  'rounded-[5px] px-[7px] py-[3px] text-[12px] leading-tight font-semibold whitespace-nowrap ' +
  'text-[#1f2421] shadow-[0_1px_3px_rgba(0,0,0,0.18)]';

export function createHouseScene(stage: HTMLElement, labelLayer: HTMLElement): HouseScene {
  /* ---------- renderer / scene ---------- */
  // Throws when WebGL is unavailable; the host shows a fallback message.
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'none';
  stage.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, stage.clientWidth / stage.clientHeight, 0.05, 400);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;

  /** Render-loop state; declared early because toggles can request a frame during setup. */
  let frameId = 0;
  let visible = true;

  /* ---------- procedural textures ---------- */
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  function tex(
    size: number,
    draw: (g: CanvasRenderingContext2D, s: number) => void,
    rep?: Point,
  ): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    draw(g, size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = maxAniso;
    if (rep) t.repeat.set(rep[0], rep[1]);
    return t;
  }
  function noise(g: CanvasRenderingContext2D, s: number, base: string, amt: number, n: number) {
    g.fillStyle = base;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < n; i++) {
      const v = Math.floor(rnd(-amt, amt));
      g.fillStyle = v > 0 ? `rgba(255,255,255,${v / 255})` : `rgba(0,0,0,${-v / 255})`;
      g.fillRect(rnd(0, s), rnd(0, s), rnd(1, 3), rnd(1, 3));
    }
  }
  const T = {
    plaster: tex(256, (g, s) => noise(g, s, '#f2eee7', 18, 7000), [0.5, 0.5]),
    plasterBase: tex(256, (g, s) => noise(g, s, '#cfc7bb', 18, 7000), [0.5, 0.5]),
    wallIn: tex(256, (g, s) => noise(g, s, '#efe6da', 10, 4000), [0.5, 0.5]),
    concrete: tex(
      256,
      (g, s) => {
        noise(g, s, '#a8a59f', 22, 9000);
        g.strokeStyle = 'rgba(0,0,0,.08)';
        g.strokeRect(0, 0, s, s);
      },
      [0.25, 0.25],
    ),
    oak: tex(
      512,
      (g, s) => {
        // 6 planks across 1.2 m
        const pw = s / 6;
        for (let i = 0; i < 6; i++) {
          const off = rnd(0, s);
          const base = [196 + rnd(-12, 10), 154 + rnd(-12, 8), 108 + rnd(-12, 8)].map(Math.round);
          g.fillStyle = `rgb(${base})`;
          g.fillRect(0, i * pw, s, pw);
          for (let k = 0; k < 40; k++) {
            g.strokeStyle = `rgba(90,55,25,${rnd(0.04, 0.12)})`;
            g.lineWidth = rnd(0.5, 1.5);
            g.beginPath();
            const y = i * pw + rnd(2, pw - 2);
            g.moveTo(0, y);
            g.bezierCurveTo(s * 0.3, y + rnd(-3, 3), s * 0.6, y + rnd(-3, 3), s, y + rnd(-2, 2));
            g.stroke();
          }
          g.fillStyle = 'rgba(60,35,15,.45)';
          g.fillRect(0, i * pw, s, 1.5);
          g.fillRect(off % s, i * pw, 1.5, pw);
        }
      },
      [1 / 1.2, 1 / 1.2],
    ),
    slats: tex(
      256,
      (g, s) => {
        // vertical cladding slats, 6 per 0.6 m
        const w = s / 6;
        for (let i = 0; i < 6; i++) {
          const c = [150 + rnd(-14, 10), 104 + rnd(-10, 8), 68 + rnd(-8, 6)].map(Math.round);
          g.fillStyle = `rgb(${c})`;
          g.fillRect(i * w, 0, w, s);
          for (let k = 0; k < 25; k++) {
            g.strokeStyle = `rgba(70,40,20,${rnd(0.05, 0.15)})`;
            g.beginPath();
            const x = i * w + rnd(2, w - 2);
            g.moveTo(x, 0);
            g.lineTo(x + rnd(-2, 2), s);
            g.stroke();
          }
          g.fillStyle = 'rgba(30,18,10,.85)';
          g.fillRect(i * w, 0, 3, s);
        }
      },
      [1 / 0.6, 1 / 0.6],
    ),
    deck: tex(
      256,
      (g, s) => {
        const h = s / 4;
        for (let i = 0; i < 4; i++) {
          g.fillStyle = `rgb(${[140 + rnd(-10, 10), 122 + rnd(-10, 8), 104 + rnd(-8, 8)].map(Math.round)})`;
          g.fillRect(0, i * h, s, h);
          g.fillStyle = 'rgba(40,30,20,.6)';
          g.fillRect(0, i * h, s, 2);
        }
      },
      [1 / 0.6, 1 / 0.6],
    ),
    tile: tex(
      256,
      (g, s) => {
        noise(g, s, '#e4dbcf', 8, 2000);
        g.strokeStyle = 'rgba(120,105,90,.35)';
        g.lineWidth = 2;
        for (let i = 0; i <= 2; i++) {
          g.beginPath();
          g.moveTo((i * s) / 2, 0);
          g.lineTo((i * s) / 2, s);
          g.stroke();
          g.beginPath();
          g.moveTo(0, (i * s) / 2);
          g.lineTo(s, (i * s) / 2);
          g.stroke();
        }
      },
      [1 / 0.6, 1 / 0.6],
    ),
    terracotta: tex(
      256,
      (g, s) => {
        const n = 4;
        const w = s / n;
        for (let i = 0; i < n; i++)
          for (let j = 0; j < n * 2; j++) {
            g.fillStyle = `rgb(${[176 + rnd(-12, 12), 98 + rnd(-10, 10), 70 + rnd(-8, 8)].map(Math.round)})`;
            g.fillRect(i * w + (j % 2 ? w / 2 : 0) - w, (j * w) / 2, w - 2, w / 2 - 2);
            g.fillRect(i * w + (j % 2 ? w / 2 : 0), (j * w) / 2, w - 2, w / 2 - 2);
          }
      },
      [1 / 0.3, 1 / 0.3],
    ),
    roller: tex(
      128,
      (g, s) => {
        for (let i = 0; i < 8; i++) {
          g.fillStyle = i % 2 ? '#4b4f52' : '#5a5f62';
          g.fillRect(0, (i * s) / 8, s, s / 8);
        }
        g.fillStyle = 'rgba(0,0,0,.35)';
        for (let i = 0; i < 8; i++) g.fillRect(0, (i * s) / 8, s, 1);
      },
      [1, 1 / 0.8],
    ),
    grass: tex(256, (g, s) => noise(g, s, '#6d8a4f', 30, 14000), [0.5, 0.5]),
    asphalt: tex(256, (g, s) => noise(g, s, '#4e4f51', 26, 14000), [0.3, 0.3]),
    paving: tex(
      256,
      (g, s) => {
        noise(g, s, '#c4bdb1', 16, 5000);
        g.strokeStyle = 'rgba(80,70,60,.3)';
        g.lineWidth = 2;
        g.strokeRect(1, 1, s - 2, s - 2);
      },
      [1 / 0.5, 1 / 0.5],
    ),
    rug: tex(
      256,
      (g, s) => {
        noise(g, s, '#d6c5a7', 14, 9000);
        g.strokeStyle = 'rgba(150,110,80,.35)';
        g.lineWidth = 6;
        g.strokeRect(14, 14, s - 28, s - 28);
      },
      [1, 1],
    ),
  };
  const slatsH = T.slats.clone();
  slatsH.needsUpdate = true;
  slatsH.center.set(0.5, 0.5);
  slatsH.rotation = Math.PI / 2;

  /* ---------- materials ---------- */
  const S = (o: THREE.MeshStandardMaterialParameters) =>
    new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o });
  const M = {
    plaster: S({ map: T.plaster, color: 0xffffff }),
    plasterBase: S({ map: T.plasterBase }),
    wallIn: S({ map: T.wallIn }),
    concrete: S({ map: T.concrete }),
    slab: S({ color: 0xe9e5de }),
    oak: S({ map: T.oak, roughness: 0.6 }),
    clad: S({ map: T.slats, roughness: 0.75 }),
    cladH: S({ map: slatsH, roughness: 0.7 }),
    deck: S({ map: T.deck, roughness: 0.85 }),
    tile: S({ map: T.tile, roughness: 0.35 }),
    terracotta: S({ map: T.terracotta, roughness: 0.6 }),
    roller: S({ map: T.roller, roughness: 0.5, metalness: 0.4 }),
    grass: S({ map: T.grass }),
    asphalt: S({ map: T.asphalt }),
    paving: S({ map: T.paving }),
    coping: S({ color: 0xc9c5bd, roughness: 0.7 }),
    alu: S({ color: 0x2a2c2d, roughness: 0.45, metalness: 0.6 }),
    steel: S({ color: 0x37393b, roughness: 0.5, metalness: 0.5 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xa9c2cc,
      metalness: 0,
      roughness: 0.05,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    glassRail: new THREE.MeshPhysicalMaterial({
      color: 0xcfe0e2,
      roughness: 0.05,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    walnut: S({ color: 0x6e4a31, roughness: 0.55 }),
    oakFurn: S({ color: 0xb98b5e, roughness: 0.55 }),
    linen: S({ color: 0xe8e1d4, roughness: 1 }),
    sofa: S({ color: 0xa98f72, roughness: 1 }),
    clay: S({ color: 0xb36a4b, roughness: 1 }),
    olive: S({ color: 0x6e7653, roughness: 1 }),
    counter: S({ color: 0xddd5c8, roughness: 0.35 }),
    black: S({ color: 0x1d1e1f, roughness: 0.4 }),
    white: S({ color: 0xf6f4f0, roughness: 0.3 }),
    chrome: S({ color: 0xcfd2d4, roughness: 0.2, metalness: 0.9 }),
    rug: S({ map: T.rug }),
    leaf: S({ color: 0x587a45, roughness: 0.9, flatShading: true }),
    leafDark: S({ color: 0x3f5d34, roughness: 0.9, flatShading: true }),
    trunk: S({ color: 0x5a4635 }),
    pot: S({ color: 0x8b5a3f, roughness: 0.8 }),
    lampOn: new THREE.MeshStandardMaterial({
      color: 0xfff2d6,
      emissive: 0xffd9a0,
      emissiveIntensity: 1.2,
    }),
    carBody: S({ color: 0x42515c, roughness: 0.3, metalness: 0.6 }),
    carGlass: S({ color: 0x1a2228, roughness: 0.1, metalness: 0.3 }),
    tyre: S({ color: 0x1a1a1a, roughness: 0.9 }),
    rack: S({ color: 0x2f5d8a, roughness: 0.5, metalness: 0.4 }),
    rackBeam: S({ color: 0xd9822b, roughness: 0.5, metalness: 0.3 }),
    carton: S({ color: 0xb08a5c, roughness: 0.9 }),
    pallet: S({ color: 0xb79c74, roughness: 0.9 }),
    nA: S({ map: T.plasterBase, color: 0xe6d6bf }),
    nB: S({ map: T.plaster, color: 0xd3d9da }),
    nWin: S({ color: 0x3b4247, roughness: 0.2, metalness: 0.3 }),
    fence: S({ color: 0x7a6047, roughness: 0.9 }),
    warn: S({ color: 0xe3a14a, roughness: 0.6 }),
  };

  /* ---------- geometry helpers ---------- */
  function worldUV(g: THREE.BufferGeometry) {
    const p = g.attributes['position'];
    const n = g.attributes['normal'];
    const uv = g.attributes['uv'];
    for (let i = 0; i < p.count; i++) {
      const nx = Math.abs(n.getX(i));
      const ny = Math.abs(n.getY(i));
      let u: number;
      let v: number;
      if (nx > 0.5) {
        u = p.getZ(i);
        v = p.getY(i);
      } else if (ny > 0.5) {
        u = p.getX(i);
        v = p.getZ(i);
      } else {
        u = p.getX(i);
        v = p.getY(i);
      }
      uv.setXY(i, u, v);
    }
    uv.needsUpdate = true;
  }

  const groupNames = [
    'site',
    'neighbours',
    'ground',
    'groundFurn',
    'slab',
    'terrace',
    'upper',
    'upperFurn',
    'roof',
    'rearStair',
  ] as const;
  const G = {} as Record<(typeof groupNames)[number], Group>;
  for (const k of groupNames) {
    G[k] = new THREE.Group() as Group;
    scene.add(G[k]);
  }

  function box(
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    mat: THREE.Material,
    grp: THREE.Object3D,
    o: { cast?: boolean; recv?: boolean } = {},
  ): THREE.Mesh | null {
    const w = x1 - x0;
    const h = y1 - y0;
    const d = z1 - z0;
    if (w <= 0.001 || h <= 0.001 || d <= 0.001) return null;
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, -(z0 + z1) / 2);
    worldUV(g);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = o.cast !== false;
    m.receiveShadow = o.recv !== false;
    grp.add(m);
    return m;
  }
  function cyl(
    x: number,
    y0: number,
    y1: number,
    z: number,
    r: number,
    mat: THREE.Material,
    grp: THREE.Object3D,
    seg?: number,
    r2?: number,
  ): THREE.Mesh {
    const g = new THREE.CylinderGeometry(r2 == null ? r : r2, r, y1 - y0, seg || 20);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, (y0 + y1) / 2, -z);
    m.castShadow = true;
    m.receiveShadow = true;
    grp.add(m);
    return m;
  }
  /* wall spanning x (thin in z) */
  function wallX(
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    y0: number,
    y1: number,
    ops: readonly Opening[],
    mat: THREE.Material,
    grp: THREE.Object3D,
  ) {
    const sorted = ops.slice().sort((p, q) => p[0] - q[0]);
    let c = x0;
    for (const [a, b, s, h] of sorted) {
      box(c, a, y0, y1, z0, z1, mat, grp);
      if (s > y0) box(a, b, y0, s, z0, z1, mat, grp);
      if (h < y1) box(a, b, h, y1, z0, z1, mat, grp);
      c = b;
    }
    box(c, x1, y0, y1, z0, z1, mat, grp);
  }
  function wallZ(
    z0: number,
    z1: number,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    ops: readonly Opening[],
    mat: THREE.Material,
    grp: THREE.Object3D,
  ) {
    const sorted = ops.slice().sort((p, q) => p[0] - q[0]);
    let c = z0;
    for (const [a, b, s, h] of sorted) {
      box(x0, x1, y0, y1, c, a, mat, grp);
      if (s > y0) box(x0, x1, y0, s, a, b, mat, grp);
      if (h < y1) box(x0, x1, h, y1, a, b, mat, grp);
      c = b;
    }
    box(x0, x1, y0, y1, c, z1, mat, grp);
  }
  /* glazing in an x-wall at z centre zc */
  function glazeX(
    a: number,
    b: number,
    zc: number,
    s: number,
    h: number,
    grp: THREE.Object3D,
    mull?: number,
    sill?: number,
  ) {
    const f = 0.05;
    const t = 0.07;
    box(a, b, s, s + f, zc - t / 2, zc + t / 2, M.alu, grp);
    box(a, b, h - f, h, zc - t / 2, zc + t / 2, M.alu, grp);
    box(a, a + f, s, h, zc - t / 2, zc + t / 2, M.alu, grp);
    box(b - f, b, s, h, zc - t / 2, zc + t / 2, M.alu, grp);
    for (let k = 1; k < (mull || 1); k++) {
      const xm = a + ((b - a) * k) / mull!;
      box(xm - f / 2, xm + f / 2, s, h, zc - t / 2, zc + t / 2, M.alu, grp);
    }
    box(a + f, b - f, s + f, h - f, zc - 0.008, zc + 0.008, M.glass, grp, { cast: false });
    if (sill) box(a - 0.05, b + 0.05, s - 0.05, s, zc - sill, zc + 0.02, M.coping, grp);
  }
  function glazeZ(
    a: number,
    b: number,
    xc: number,
    s: number,
    h: number,
    grp: THREE.Object3D,
    mull?: number,
    sill?: number,
  ) {
    const f = 0.05;
    const t = 0.07;
    box(xc - t / 2, xc + t / 2, s, s + f, a, b, M.alu, grp);
    box(xc - t / 2, xc + t / 2, h - f, h, a, b, M.alu, grp);
    box(xc - t / 2, xc + t / 2, s, h, a, a + f, M.alu, grp);
    box(xc - t / 2, xc + t / 2, s, h, b - f, b, M.alu, grp);
    for (let k = 1; k < (mull || 1); k++) {
      const zm = a + ((b - a) * k) / mull!;
      box(xc - t / 2, xc + t / 2, s, h, zm - f / 2, zm + f / 2, M.alu, grp);
    }
    box(xc - 0.008, xc + 0.008, s + f, h - f, a + f, b - f, M.glass, grp, { cast: false });
    if (sill) box(xc - sill, xc + 0.02, s - 0.05, s, a - 0.05, b + 0.05, M.coping, grp);
  }
  /* door casing (interior) */
  function casingX(a: number, b: number, z0: number, z1: number, h: number, grp: Group) {
    const f = 0.04;
    const fl = grp.userData.fl ?? 0;
    box(a, a + f, fl, h, z0 - 0.01, z1 + 0.01, M.oakFurn, grp);
    box(b - f, b, fl, h, z0 - 0.01, z1 + 0.01, M.oakFurn, grp);
    box(a, b, h - f, h, z0 - 0.01, z1 + 0.01, M.oakFurn, grp);
  }
  function casingZ(a: number, b: number, x0: number, x1: number, h: number, grp: Group) {
    const f = 0.04;
    const fl = grp.userData.fl ?? 0;
    box(x0 - 0.01, x1 + 0.01, fl, h, a, a + f, M.oakFurn, grp);
    box(x0 - 0.01, x1 + 0.01, fl, h, b - f, b, M.oakFurn, grp);
    box(x0 - 0.01, x1 + 0.01, h - f, h, a, b, M.oakFurn, grp);
  }
  /* horizontal slab from plan polygon with holes */
  function slab(
    poly: readonly Point[],
    holes: readonly (readonly Point[])[],
    yTop: number,
    th: number,
    mat: THREE.Material,
    grp: THREE.Object3D,
  ) {
    const sh = new THREE.Shape(poly.map((p) => new THREE.Vector2(p[0], -p[1])));
    holes.forEach((h) =>
      sh.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], -p[1])))),
    );
    const g = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false });
    g.rotateX(Math.PI / 2);
    g.translate(0, yTop, 0);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    grp.add(m);
    return m;
  }
  function foliage(
    radius: number,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    grp: THREE.Object3D,
  ) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), mat);
    m.position.set(x, y, -z);
    m.castShadow = true;
    grp.add(m);
    return m;
  }

  G.ground.userData.fl = 0;
  G.groundFurn.userData.fl = 0;
  G.upper.userData.fl = H1;
  G.upperFurn.userData.fl = H1;

  /* ================= SITE ================= */
  box(-14, 23, -0.32, -0.12, -12, -2.6, M.asphalt, G.site, { cast: false });
  box(-14, 23, -0.12, 0, -2.6, -0.0, M.paving, G.site, { cast: false });
  box(-14, 23, -0.12, 0.02, -2.75, -2.6, M.coping, G.site, { cast: false });
  // lane markings
  for (let x = -12; x < 22; x += 4)
    box(x, x + 2, -0.119, -0.115, -7.4, -7.25, M.white, G.site, { cast: false });
  // garden
  box(0, 9, -0.15, -0.02, 17, 27, M.grass, G.site, { cast: false });
  box(0, 9, -0.15, 0.0, 17, 18.3, M.paving, G.site, { cast: false });
  box(-14, 0, -0.15, -0.03, 17.5, 27, M.grass, G.site, { cast: false });
  box(9, 23, -0.15, -0.03, 16, 27, M.grass, G.site, { cast: false });
  // fences
  box(-0.05, 0.0, 0, 1.8, 17, 27, M.fence, G.site);
  box(9, 9.05, 0, 1.8, 17, 27, M.fence, G.site);
  box(0, 9, 0, 1.8, 26.95, 27, M.fence, G.site);
  function tree(x: number, z: number, s: number) {
    cyl(x, 0, 1.6 * s, z, 0.12 * s, M.trunk, G.site, 8);
    (
      [
        [0, 2.5, 0, 1.3],
        [0.6, 2.2, 0.3, 0.9],
        [-0.5, 2.3, -0.3, 1],
        [0.1, 3.1, 0.2, 0.9],
      ] as const
    ).forEach(([dx, dy, dz, r], i) =>
      foliage(r * s, i % 2 ? M.leafDark : M.leaf, x + dx * s, dy * s, z + dz * s, G.site),
    );
  }
  tree(2.2, 23.5, 1.2);
  tree(7, 25, 0.9);
  // street trees
  tree(-3, -1.6, 0.9);
  tree(13, -1.6, 1);

  /* ================= NEIGHBOURS ================= */
  box(-9, 0, 0, 7.4, 0.4, 17.4, M.nA, G.neighbours);
  box(-9.1, 0.02, 7.4, 7.7, 0.3, 17.5, M.coping, G.neighbours);
  for (let i = 0; i < 3; i++) {
    box(-8 + i * 2.8, -6.6 + i * 2.8, 1.0, 2.6, 0.33, 0.4, M.nWin, G.neighbours);
    box(-8 + i * 2.8, -6.6 + i * 2.8, 4.4, 6.0, 0.33, 0.4, M.nWin, G.neighbours);
  }
  box(9, 18, 0, 6.6, -0.2, 16, M.nB, G.neighbours);
  box(8.98, 18.1, 6.6, 6.85, -0.3, 16.1, M.coping, G.neighbours);
  for (let i = 0; i < 3; i++)
    box(10 + i * 2.8, 11.4 + i * 2.8, 3.9, 5.5, -0.27, -0.2, M.nWin, G.neighbours);
  box(10.2, 12.6, 0, 2.4, -0.27, -0.2, M.nWin, G.neighbours);
  box(13.5, 17, 0, 2.6, -0.27, -0.2, M.roller, G.neighbours);

  /* ================= GROUND FLOOR ================= */
  const g = G.ground;
  box(0, 9, -0.12, 0, 0, 17, M.concrete, g, { cast: false });
  // outer side walls (blind)
  box(0, 0.3, 0, W1, 0, 17, M.plasterBase, g);
  box(8.7, 9, 0, W1, 0, 17, M.plasterBase, g);
  // front wall: warehouse gate, garage door, home entry door
  wallX(
    0,
    9,
    0,
    0.3,
    0,
    W1,
    [
      [0.6, 3.6, 0, 3.0],
      [4.35, 7.25, 0, 2.5],
      [7.6, 8.5, 0, 2.25],
    ],
    M.plasterBase,
    g,
  );
  // wood cladding panel framing the home entry side
  box(7.35, 8.75, 0, W1, -0.04, 0.0, M.clad, g);
  box(7.6, 8.5, 0, 2.25, -0.05, 0.01, M.alu, g); // clear entry recess frame
  // rear wall
  wallX(
    0,
    9,
    16.7,
    17,
    0,
    W1,
    [
      [0.9, 3.1, 2.0, 3.0],
      [4.2, 5.6, 2.0, 3.0],
      [7.35, 8.1, 2.3, 2.9],
    ],
    M.plasterBase,
    g,
  );
  glazeX(0.9, 3.1, 16.85, 2.0, 3.0, g, 2, 0.15);
  glazeX(4.2, 5.6, 16.85, 2.0, 3.0, g, 1, 0.15);
  glazeX(7.35, 8.1, 16.85, 2.3, 2.9, g, 1, 0.15);
  // warehouse | garage partition (fire-rated)
  box(4.0, 4.15, 0, W1, 0.3, 10.0, M.wallIn, g);
  // garage rear wall with door to stair
  wallX(4.15, 8.7, 7.1, 7.25, 0, W1, [[4.3, 5.2, 0, 2.1]], M.wallIn, g);
  // stair rear wall (separates from rental area)
  box(4.0, 8.7, 0, W1, 9.85, 10.0, M.wallIn, g);
  // WC
  box(6.7, 6.85, 0, W1, 14.55, 16.7, M.wallIn, g);
  wallX(6.85, 8.7, 14.55, 14.7, 0, W1, [[7.25, 8.05, 0, 2.1]], M.wallIn, g);

  // gates and doors (front)
  box(0.6, 3.6, 0, 3.0, 0.05, 0.1, M.roller, g); // roller gate
  box(0.5, 3.7, 3.0, 3.18, -0.02, 0.1, M.alu, g); // gate box
  box(4.35, 7.25, 0, 2.5, 0.06, 0.1, M.cladH, g); // timber sectional garage door
  for (let i = 1; i < 4; i++)
    box(4.35, 7.25, i * 0.625 - 0.01, i * 0.625 + 0.01, 0.04, 0.06, M.alu, g);
  box(7.6, 8.5, 0, 2.25, 0.12, 0.16, M.walnut, g); // home entry door (set back)
  box(8.33, 8.37, 0.9, 1.35, 0.1, 0.12, M.chrome, g);
  // small canopy over garage + entry
  box(4.2, 8.75, 2.62, 2.72, -0.65, 0.0, M.alu, g);
  // wall lights + house number
  (
    [
      [3.85, 2.6],
      [8.15, 2.4],
    ] as const
  ).forEach(([x, y]) =>
    box(x - 0.06, x + 0.06, y, y + 0.2, -0.06, 0, M.lampOn, g, { cast: false }),
  );
  box(7.65, 7.95, 2.4, 2.55, -0.05, -0.04, M.black, g);

  // stair (U-stair 4.55 x 2.6 behind garage), 18 risers to +3.5
  const R = H1 / 18;
  const TR = 0.27;
  const XS = 5.35;
  const XL = XS + 8 * TR; // start of mid landing
  for (let i = 1; i <= 8; i++) {
    box(XS + (i - 1) * TR, XS + i * TR, 0, i * R, 7.25, 8.35, M.concrete, g);
    box(XS + (i - 1) * TR, XS + i * TR + 0.02, i * R, i * R + 0.03, 7.25, 8.35, M.oakFurn, g);
  }
  box(XL, 8.7, 0, 9 * R, 7.25, 9.85, M.concrete, g);
  box(XL, 8.7, 9 * R, 9 * R + 0.03, 7.25, 9.85, M.oakFurn, g);
  for (let j = 1; j <= 8; j++) {
    const xa = XL - j * TR;
    const xb = XL - (j - 1) * TR;
    const top = 9 * R + j * R;
    box(xa, xb, top - 0.45, top, 8.75, 9.85, M.concrete, g);
    box(xa - 0.02, xb, top, top + 0.03, 8.75, 9.85, M.oakFurn, g);
  }
  box(XS, XL, 0, H1 + 0.95, 8.4, 8.7, M.wallIn, g); // central stair wall (acts as guard upstairs)
  box(XS, XL, H1 + 0.95, H1 + 1.0, 8.37, 8.73, M.oakFurn, g); // handrail cap

  /* ground furniture: car, racks, WC */
  const gf = G.groundFurn;
  (function car() {
    const x0 = 4.45;
    const x1 = 6.25;
    const z0 = 0.8;
    const z1 = 5.3;
    box(x0, x1, 0.32, 0.95, z0, z1, M.carBody, gf);
    box(x0 + 0.12, x1 - 0.12, 0.95, 1.45, z0 + 1.1, z1 - 1.0, M.carGlass, gf);
    box(x0 + 0.15, x1 - 0.15, 1.45, 1.48, z0 + 1.2, z1 - 1.1, M.carBody, gf);
    (
      [
        [x0 + 0.02, z0 + 0.8],
        [x1 - 0.02, z0 + 0.8],
        [x0 + 0.02, z1 - 0.8],
        [x1 - 0.02, z1 - 0.8],
      ] as const
    ).forEach(([x, z]) => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 20), M.tyre);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.33, -z);
      w.castShadow = true;
      gf.add(w);
    });
    box(x0 + 0.15, x0 + 0.45, 0.62, 0.78, z0 - 0.02, z0, M.lampOn, gf);
    box(x1 - 0.45, x1 - 0.15, 0.62, 0.78, z0 - 0.02, z0, M.lampOn, gf);
  })();
  box(8.2, 8.68, 0, 1.9, 1.5, 4.5, M.walnut, gf); // garage storage cabinet
  function rackRun(x0: number, x1: number, z0: number, z1: number, levels: number, h: number) {
    const step = (x1 - x0) / Math.round((x1 - x0) / 2.7);
    for (let x = x0; x <= x1 + 0.01; x += step) {
      box(x - 0.04, x + 0.04, 0, h, z0, z0 + 0.08, M.rack, gf);
      box(x - 0.04, x + 0.04, 0, h, z1 - 0.08, z1, M.rack, gf);
    }
    for (let l = 0; l < levels; l++) {
      const y = 0.15 + l * (h / levels);
      box(x0, x1, y, y + 0.1, z0, z0 + 0.06, M.rackBeam, gf);
      box(x0, x1, y, y + 0.1, z1 - 0.06, z1, M.rackBeam, gf);
      for (let x = x0 + 0.15; x < x1 - 0.9; x += 1.3) {
        if (Math.random() < 0.8) {
          box(x, x + 1.1, y + 0.1, y + 0.25, z0 + 0.05, z1 - 0.05, M.pallet, gf);
          box(
            x + 0.05,
            x + 1.05,
            y + 0.25,
            y + 0.25 + rnd(0.4, 0.8),
            z0 + 0.1,
            z1 - 0.1,
            M.carton,
            gf,
          );
        }
      }
    }
  }
  rackRun(0.45, 6.4, 15.6, 16.6, 3, 2.9); // along rear wall
  for (let z = 1.0; z < 9.0; z += 1.35) {
    box(0.45, 1.55, 0, 0.15, z, z + 1.2, M.pallet, gf);
    box(0.5, 1.5, 0.15, 0.15 + rnd(0.5, 1.1), z + 0.05, z + 1.15, M.carton, gf);
  }
  for (let z = 11; z < 14; z += 1.35) {
    box(2.2, 3.3, 0, 0.15, z, z + 1.2, M.pallet, gf);
    box(2.25, 3.25, 0.15, 0.15 + rnd(0.4, 1), z + 0.05, z + 1.15, M.carton, gf);
  }
  box(7.9, 8.4, 0, 0.42, 15.9, 16.6, M.white, gf);
  box(7.95, 8.35, 0.42, 0.8, 16.45, 16.65, M.white, gf); // WC
  box(7.0, 7.45, 0.8, 0.95, 16.3, 16.65, M.white, gf); // basin

  /* ================= UPPER SLAB + TERRACE ================= */
  slab(rect(0, 0, 9, 17), [rect(XS, 7.25, 8.7, 9.85)], H1, SLAB, M.slab, G.slab);
  box(0, 9, W1 - 0.02, W1, 0, 0.02, M.coping, G.slab); // drip line
  // terrace decking: front 9x2 + side 4x4.3
  box(0.25, 8.75, H1, H1 + 0.03, 0.2, 2.0, M.deck, G.terrace, { cast: false });
  box(0.25, 4.0, H1, H1 + 0.03, 2.0, 6.3, M.deck, G.terrace, { cast: false });
  // front upstand + frameless glass railing
  box(0.25, 8.75, H1, H1 + 0.25, 0, 0.2, M.plaster, G.terrace);
  box(0.25, 8.75, H1 + 0.25, H1 + 0.27, 0, 0.2, M.coping, G.terrace);
  box(0.27, 8.73, H1 + 0.27, H1 + 1.1, 0.08, 0.1, M.glassRail, G.terrace, { cast: false });
  box(0.25, 8.75, H1 + 1.08, H1 + 1.12, 0.06, 0.12, M.alu, G.terrace);
  // privacy walls on boundaries (no openings to neighbours)
  box(0, 0.25, H1, H1 + 1.8, 0, 6.3, M.plaster, G.terrace);
  box(0, 0.25, H1 + 1.8, H1 + 1.84, 0, 6.3, M.coping, G.terrace);
  box(8.75, 9, H1, H1 + 1.8, 0, 2.0, M.plaster, G.terrace);
  box(8.75, 9, H1 + 1.8, H1 + 1.84, 0, 2.0, M.coping, G.terrace);
  // terrace furniture
  {
    const t = G.terrace;
    const fl = H1 + 0.03;
    // lounge set on side terrace
    box(0.4, 2.6, fl, fl + 0.38, 3.0, 3.75, M.oakFurn, t);
    box(0.4, 2.6, fl + 0.38, fl + 0.5, 3.0, 3.75, M.linen, t);
    box(0.4, 2.6, fl + 0.38, fl + 0.8, 3.55, 3.75, M.linen, t);
    box(0.4, 1.15, fl, fl + 0.5, 3.75, 5.3, M.oakFurn, t);
    box(0.4, 1.15, fl + 0.38, fl + 0.5, 3.75, 5.3, M.linen, t);
    box(0.4, 0.6, fl + 0.38, fl + 0.8, 3.75, 5.3, M.linen, t);
    box(1.6, 2.6, fl, fl + 0.35, 4.2, 5.0, M.oakFurn, t);
    cyl(2.1, fl + 0.35, fl + 0.55, 4.6, 0.08, M.clay, t, 12);
    // dining on front terrace
    box(1.0, 2.6, fl + 0.72, fl + 0.76, 0.55, 1.45, M.oakFurn, t);
    box(1.05, 1.12, fl, fl + 0.72, 0.6, 1.4, M.oakFurn, t);
    box(2.48, 2.55, fl, fl + 0.72, 0.6, 1.4, M.oakFurn, t);
    (
      [
        [1.3, 0.35],
        [2.1, 0.35],
        [1.3, 1.65],
        [2.1, 1.65],
      ] as const
    ).forEach(([x, z]) => {
      box(x - 0.22, x + 0.22, fl + 0.42, fl + 0.46, z - 0.2, z + 0.2, M.alu, t);
      box(x - 0.22, x + 0.22, fl, fl + 0.42, z - 0.02, z + 0.02, M.alu, t);
    });
    // planters
    (
      [
        [3.3, 0.6],
        [5.0, 0.6],
        [8.3, 0.6],
        [3.6, 5.8],
      ] as const
    ).forEach(([x, z]) => {
      box(x - 0.3, x + 0.3, fl, fl + 0.5, z - 0.3, z + 0.3, M.coping, t);
      foliage(0.42, M.leaf, x, fl + 0.85, z, t);
    });
    box(5.6, 8.4, fl, fl + 0.45, 1.2, 1.9, M.coping, t);
    for (let x = 5.9; x < 8.3; x += 0.55) foliage(0.32, M.leafDark, x, fl + 0.72, 1.55, t);
  }

  /* ================= UPPER FLOOR ================= */
  const u = G.upper;
  const fl = H1;
  // interior floors
  box(0.3, 8.7, fl, fl + 0.02, 6.45, 7.25, M.oak, u, { cast: false });
  box(0.3, XS, fl, fl + 0.02, 7.25, 9.85, M.oak, u, { cast: false });
  box(0.3, 8.7, fl, fl + 0.02, 9.85, 16.7, M.oak, u, { cast: false });
  box(4.3, 8.7, fl, fl + 0.02, 2.3, 6.45, M.oak, u, { cast: false });
  box(3.85, 8.7, fl + 0.02, fl + 0.03, 10.0, 11.5, M.tile, u, { cast: false });
  // side walls (blind)
  box(0, 0.3, fl, H2, 6.3, 17, M.plaster, u);
  box(8.7, 9, fl, H2, 2.0, 17, M.plaster, u);
  // rear wall: two bedroom windows + provisional garden door
  wallX(
    0,
    9,
    16.7,
    17,
    fl,
    H2,
    [
      [0.95, 3.1, fl + 0.9, fl + 2.35],
      [4.55, 6.7, fl + 0.9, fl + 2.35],
      [7.65, 8.55, fl, fl + 2.2],
    ],
    M.plaster,
    u,
  );
  glazeX(0.95, 3.1, 16.85, fl + 0.9, fl + 2.35, u, 2, 0.2);
  glazeX(4.55, 6.7, 16.85, fl + 0.9, fl + 2.35, u, 2, 0.2);
  box(7.65, 8.55, fl, fl + 2.2, 16.8, 16.86, M.walnut, u);
  // house front wall facing side terrace: large sliding door
  wallX(0, 4.3, 6.3, 6.5, fl, H2, [[0.55, 3.55, fl, fl + 2.45]], M.plaster, u);
  glazeX(0.55, 3.55, 6.4, fl, fl + 2.45, u, 2, 0);
  // timber reveal frame around the living opening
  box(0.45, 3.65, fl + 2.45, fl + 2.6, 6.24, 6.3, M.clad, u);
  box(0.45, 0.55, fl, fl + 2.6, 6.24, 6.3, M.clad, u);
  box(3.55, 3.65, fl, fl + 2.6, 6.24, 6.3, M.clad, u);
  // enclosed stair lobby above garage (5.0 x 4.3), wood clad outside
  wallX(4.0, 9.0, 2.0, 2.3, fl, H2, [[4.9, 8.2, fl + 0.5, fl + 2.45]], M.plaster, u);
  glazeX(4.9, 8.2, 2.15, fl + 0.5, fl + 2.45, u, 3, 0.2);
  wallZ(2.0, 6.3, 4.0, 4.3, fl, H2, [[3.0, 5.4, fl + 0.9, fl + 2.45]], M.plaster, u);
  glazeZ(3.0, 5.4, 4.15, fl + 0.9, fl + 2.45, u, 2, 0.2);
  wallX(4.0, 9.0, 1.95, 2.0, fl, H2, [[4.9, 8.2, fl + 0.5, fl + 2.45]], M.clad, u);
  wallZ(2.0, 6.3, 3.95, 4.0, fl, H2, [[3.0, 5.4, fl + 0.9, fl + 2.45]], M.clad, u);
  // interior partitions
  wallZ(6.5, 11.65, 3.7, 3.85, fl, H2, [[6.5, 7.25, fl, fl + 2.1]], M.wallIn, u); // living | landing/stair/bath
  casingZ(6.5, 7.25, 3.68, 3.87, fl + 2.1, u);
  box(3.85, 8.7, fl, H2, 9.85, 10.0, M.wallIn, u); // stair | bath
  box(7.25, 7.4, fl, H2, 10.0, 11.5, M.wallIn, u); // bath | laundry
  wallX(
    3.85,
    8.7,
    11.5,
    11.65,
    fl,
    H2,
    [
      [5.0, 5.8, fl, fl + 2.1],
      [7.65, 8.45, fl, fl + 2.1],
    ],
    M.wallIn,
    u,
  );
  casingX(5.0, 5.8, 11.5, 11.65, fl + 2.1, u);
  casingX(7.65, 8.45, 11.5, 11.65, fl + 2.1, u);
  wallX(
    0.3,
    8.7,
    12.85,
    13.0,
    fl,
    H2,
    [
      [2.55, 3.4, fl, fl + 2.1],
      [4.15, 5.0, fl, fl + 2.1],
      [7.5, 8.7, fl, fl + 2.3],
    ],
    M.wallIn,
    u,
  ); // hall | bedrooms
  casingX(2.55, 3.4, 12.85, 13.0, fl + 2.1, u);
  casingX(4.15, 5.0, 12.85, 13.0, fl + 2.1, u);
  box(3.75, 3.9, fl, H2, 13.0, 16.7, M.wallIn, u); // bedroom | bedroom
  box(7.35, 7.5, fl, H2, 13.0, 16.7, M.wallIn, u); // bedroom 2 | passage
  // stair void guard (top of flight 1)
  box(XS, 8.7, fl, fl + 1.0, 7.24, 7.27, M.glassRail, u, { cast: false });
  box(XS, 8.7, fl + 0.97, fl + 1.0, 7.22, 7.29, M.oakFurn, u);
  box(XS - 0.015, XS + 0.015, fl, fl + 1.0, 7.25, 8.4, M.glassRail, u, { cast: false });
  box(XS - 0.03, XS + 0.03, fl + 0.97, fl + 1.0, 7.25, 8.4, M.oakFurn, u);

  /* upper furniture */
  const f = G.upperFurn;
  const F = fl + 0.02;
  // living
  box(0.75, 3.2, F, F + 0.01, 6.9, 9.2, M.rug, f, { cast: false });
  box(0.35, 1.25, F, F + 0.42, 6.9, 9.3, M.sofa, f);
  box(0.35, 0.6, F + 0.42, F + 0.85, 6.9, 9.3, M.sofa, f);
  box(0.35, 1.25, F + 0.42, F + 0.62, 6.9, 7.1, M.sofa, f);
  box(0.35, 1.25, F + 0.42, F + 0.62, 9.1, 9.3, M.sofa, f);
  box(0.62, 1.2, F + 0.42, F + 0.52, 7.12, 8.08, M.linen, f);
  box(0.62, 1.2, F + 0.42, F + 0.52, 8.12, 9.08, M.linen, f);
  box(0.62, 0.78, F + 0.5, F + 0.82, 7.3, 7.75, M.clay, f);
  box(0.62, 0.78, F + 0.5, F + 0.82, 8.6, 9.0, M.olive, f);
  box(1.65, 2.45, F, F + 0.36, 7.6, 8.6, M.walnut, f);
  cyl(2.05, F + 0.36, F + 0.5, 8.0, 0.09, M.clay, f, 14, 0.06);
  box(3.32, 3.7, F, F + 0.5, 7.3, 9.2, M.walnut, f);
  box(3.6, 3.7, F + 0.8, F + 2.6, 7.0, 9.5, M.clad, f);
  box(3.55, 3.6, F + 1.0, F + 1.75, 7.6, 8.9, M.black, f);
  cyl(0.6, F, F + 1.55, 6.75, 0.015, M.black, f, 8);
  cyl(0.6, F + 1.45, F + 1.7, 6.75, 0.14, M.lampOn, f, 16, 0.18);
  box(2.8, 3.25, F, F + 0.42, 6.65, 7.05, M.oakFurn, f); // side stool
  cyl(3.35, F, F + 0.45, 6.85, 0.17, M.pot, f, 14);
  foliage(0.42, M.leaf, 3.35, F + 1.0, 6.85, f);
  // kitchen along party wall
  box(0.3, 0.92, F, F + 0.86, 9.7, 11.0, M.oakFurn, f);
  box(0.3, 0.95, F + 0.86, F + 0.9, 9.7, 11.0, M.counter, f);
  box(0.3, 0.32, F + 0.9, F + 1.5, 9.7, 11.0, M.terracotta, f);
  box(0.3, 0.65, F + 1.5, F + 2.25, 9.7, 11.0, M.oakFurn, f);
  box(0.3, 0.95, F, F + 2.25, 11.0, 11.62, M.white, f); // tall fridge unit
  box(0.45, 0.8, F + 0.9, F + 0.92, 10.15, 10.7, M.black, f); // hob
  box(0.55, 0.75, F + 0.9, F + 0.96, 9.9, 10.05, M.chrome, f); // tap/sink
  // dining
  box(1.65, 2.6, F + 0.73, F + 0.77, 9.85, 11.35, M.oakFurn, f);
  box(2.08, 2.17, F, F + 0.73, 10.0, 11.2, M.walnut, f);
  (
    [
      [1.55, 10.25],
      [1.55, 10.95],
      [2.7, 10.25],
      [2.7, 10.95],
    ] as const
  ).forEach(([x, z]) => {
    box(x - 0.21, x + 0.21, F + 0.44, F + 0.48, z - 0.2, z + 0.2, M.walnut, f);
    for (const dx of [-0.18, 0.18])
      for (const dz of [-0.17, 0.17])
        box(x + dx - 0.02, x + dx + 0.02, F, F + 0.44, z + dz - 0.02, z + dz + 0.02, M.walnut, f);
    const back = x < 2 ? x - 0.22 : x + 0.18;
    box(back, back + 0.04, F + 0.48, F + 0.86, z - 0.2, z + 0.2, M.walnut, f);
  });
  cyl(2.12, H2 - 0.9, H2, 10.6, 0.004, M.black, f, 4);
  cyl(2.12, H2 - 1.12, H2 - 0.9, 10.6, 0.04, M.lampOn, f, 20, 0.22);
  // bath
  box(3.85, 4.95, F, F + 0.05, 10.0, 11.5, M.tile, f);
  box(4.95, 4.97, F, F + 2.0, 10.0, 11.0, M.glassRail, f, { cast: false });
  box(3.85, 3.87, F, F + 2.2, 10.0, 11.5, M.tile, f);
  box(3.85, 7.25, F, F + 1.3, 10.0, 10.02, M.tile, f);
  cyl(4.3, F + 1.9, F + 1.95, 10.3, 0.12, M.chrome, f, 16);
  box(5.3, 6.4, F + 0.5, F + 0.85, 10.0, 10.5, M.oakFurn, f);
  box(5.4, 6.3, F + 0.85, F + 0.9, 10.05, 10.45, M.white, f);
  box(5.4, 6.3, F + 1.1, F + 1.9, 10.0, 10.02, M.chrome, f);
  box(6.6, 7.05, F, F + 0.42, 10.0, 10.6, M.white, f);
  box(6.6, 7.05, F + 0.42, F + 0.8, 10.0, 10.15, M.white, f);
  // laundry
  box(7.45, 8.05, F, F + 0.85, 10.02, 10.62, M.white, f);
  box(7.45, 8.05, F + 0.85, F + 1.7, 10.02, 10.62, M.white, f);
  const dr = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 24), M.black);
  dr.rotation.x = Math.PI / 2;
  dr.position.set(7.75, F + 0.45, -10.63);
  f.add(dr);
  const dr2 = dr.clone();
  dr2.position.y = F + 1.28;
  f.add(dr2);
  box(8.1, 8.68, F + 1.6, F + 2.2, 10.02, 11.45, M.oakFurn, f);
  // hall
  box(0.35, 0.75, F, F + 0.8, 12.0, 12.8, M.walnut, f);
  // bedroom 1
  box(0.3, 2.35, F, F + 0.6, 13.0, 13.6, M.oakFurn, f);
  box(0.3, 2.35, F + 0.6, H2 - 0.05, 13.0, 13.6, M.oakFurn, f);
  for (let x = 0.82; x < 2.3; x += 0.51)
    box(x - 0.005, x + 0.005, F + 0.05, H2 - 0.08, 13.6, 13.61, M.walnut, f);
  box(0.3, 0.38, F, F + 1.15, 14.2, 15.9, M.sofa, f);
  box(0.38, 2.4, F, F + 0.32, 14.25, 15.85, M.walnut, f);
  box(0.4, 2.38, F + 0.32, F + 0.55, 14.3, 15.8, M.white, f);
  box(0.95, 2.4, F + 0.55, F + 0.6, 14.28, 15.82, M.linen, f);
  box(1.9, 2.42, F + 0.56, F + 0.64, 14.27, 15.83, M.clay, f);
  box(0.45, 0.85, F + 0.55, F + 0.72, 14.4, 14.95, M.white, f);
  box(0.45, 0.85, F + 0.55, F + 0.72, 15.15, 15.7, M.white, f);
  [13.75, 16.0].forEach((z) => {
    box(0.3, 0.75, F, F + 0.5, z, z + 0.45, M.walnut, f);
    cyl(0.52, F + 0.5, F + 0.75, z + 0.22, 0.09, M.lampOn, f, 14, 0.12);
  });
  box(1.0, 3.0, F, F + 0.01, 14.0, 16.3, M.rug, f, { cast: false });
  // bedroom 2
  box(5.3, 7.35, F, H2 - 0.05, 13.0, 13.6, M.oakFurn, f);
  for (let x = 5.8; x < 7.3; x += 0.51)
    box(x - 0.005, x + 0.005, F + 0.05, H2 - 0.08, 13.6, 13.61, M.walnut, f);
  box(7.27, 7.35, F, F + 1.15, 14.2, 15.9, M.sofa, f);
  box(5.25, 7.27, F, F + 0.32, 14.25, 15.85, M.walnut, f);
  box(5.27, 7.25, F + 0.32, F + 0.55, 14.3, 15.8, M.white, f);
  box(5.25, 6.7, F + 0.55, F + 0.6, 14.28, 15.82, M.olive, f);
  box(6.8, 7.2, F + 0.55, F + 0.72, 14.4, 15.7, M.white, f);
  box(3.95, 5.05, F + 0.73, F + 0.77, 16.1, 16.65, M.oakFurn, f);
  box(3.97, 4.03, F, F + 0.73, 16.12, 16.62, M.oakFurn, f);
  box(4.97, 5.03, F, F + 0.73, 16.12, 16.62, M.oakFurn, f);
  box(4.3, 4.7, F + 0.42, F + 0.46, 15.6, 16.0, M.walnut, f);
  box(4.3, 4.7, F + 0.46, F + 0.85, 15.56, 15.6, M.walnut, f);
  // lobby
  box(4.6, 8.4, F, F + 0.01, 2.7, 5.9, M.rug, f, { cast: false });
  box(8.1, 8.7, F, H2 - 0.05, 2.4, 4.6, M.oakFurn, f);
  for (let z = 2.95; z < 4.6; z += 0.55)
    box(8.09, 8.1, F + 0.05, H2 - 0.08, z - 0.005, z + 0.005, M.walnut, f);
  box(4.4, 4.85, F, F + 0.45, 4.6, 6.0, M.walnut, f);
  box(4.42, 4.83, F + 0.45, F + 0.52, 4.65, 5.95, M.linen, f);
  cyl(4.7, F, F + 0.5, 2.75, 0.2, M.pot, f, 14);
  foliage(0.55, M.leafDark, 4.7, F + 1.25, 2.75, f);
  cyl(6.5, H2 - 0.06, H2, 4.3, 0.22, M.lampOn, f, 24);

  /* ================= ROOF ================= */
  const roofPoly: Point[] = [
    [4, 2],
    [9, 2],
    [9, 17],
    [0, 17],
    [0, 6.3],
    [4, 6.3],
  ];
  const skys = [
    rect(1.2, 9.6, 2.8, 10.9),
    rect(4.9, 10.35, 6.3, 11.15),
    rect(5.6, 11.85, 7.1, 12.55),
  ];
  slab(roofPoly, skys, ROOF, ROOF - H2, M.slab, G.roof);
  skys.forEach((s) => {
    const [x0, z0] = s[0];
    const [x1, z1] = s[2];
    box(x0 - 0.08, x1 + 0.08, ROOF, ROOF + 0.25, z0 - 0.08, z0, M.coping, G.roof);
    box(x0 - 0.08, x1 + 0.08, ROOF, ROOF + 0.25, z1, z1 + 0.08, M.coping, G.roof);
    box(x0 - 0.08, x0, ROOF, ROOF + 0.25, z0, z1, M.coping, G.roof);
    box(x1, x1 + 0.08, ROOF, ROOF + 0.25, z0, z1, M.coping, G.roof);
    box(x0, x1, ROOF + 0.24, ROOF + 0.26, z0, z1, M.glass, G.roof, { cast: false });
  });
  // parapets
  const pt = 0.2;
  const pm = M.plaster;
  box(4, 9, ROOF, PARA, 2.0, 2.0 + pt, pm, G.roof);
  box(9 - pt, 9, ROOF, PARA, 2.0, 17, pm, G.roof);
  box(0, 9, ROOF, PARA, 17 - pt, 17, pm, G.roof);
  box(0, pt, ROOF, PARA, 6.3, 17, pm, G.roof);
  box(0, 4, ROOF, PARA, 6.3, 6.3 + pt, pm, G.roof);
  box(4, 4 + pt, ROOF, PARA, 2.0, 6.3, pm, G.roof);
  // wood cladding continues up the lobby parapet (front + side)
  box(4.0, 9.0, ROOF, PARA, 1.95, 2.0, M.clad, G.roof);
  box(3.95, 4.0, ROOF, PARA, 1.95, 6.3, M.clad, G.roof);
  (
    [
      [4, 9, 2.0, 2.0 + pt],
      [9 - pt, 9, 2.0, 17],
      [0, 9, 17 - pt, 17],
      [0, pt, 6.3, 17],
      [0, 4, 6.3, 6.3 + pt],
      [4, 4 + pt, 2.0, 6.3],
    ] as const
  ).forEach(([a, b, c, d]) =>
    box(a - 0.02, b + 0.02, PARA, PARA + 0.05, c - 0.02, d + 0.02, M.coping, G.roof),
  );
  // roof plant + gravel
  box(0.2, 8.8, ROOF, ROOF + 0.04, 6.5, 16.8, M.concrete, G.roof, { cast: false });
  box(6.4, 7.6, ROOF, ROOF + 0.7, 14.0, 15.0, M.chrome, G.roof);
  box(1.0, 2.2, ROOF, ROOF + 0.35, 14.5, 15.2, M.white, G.roof);
  // solar water heater / pv frame
  box(1.0, 3.6, ROOF + 0.3, ROOF + 0.36, 12.6, 14.0, M.carGlass, G.roof);
  box(1.0, 3.6, ROOF, ROOF + 0.3, 13.9, 14.0, M.steel, G.roof);

  /* ================= PROVISIONAL REAR GARDEN STAIR ================= */
  {
    const r = G.rearStair;
    box(7.35, 8.9, fl - 0.12, fl, 17.0, 18.2, M.steel, r); // landing
    const n = 18;
    const dx = 0.26;
    for (let i = 1; i < n; i++) {
      const y = fl - i * R;
      const x = 7.35 - i * dx;
      box(x, x + dx + 0.02, y - 0.04, y, 17.05, 18.05, M.steel, r);
    }
    const x0 = 7.35 - n * dx;
    const len = Math.hypot(n * dx, fl);
    const ang = Math.atan2(fl, n * dx);
    [17.05, 18.05].forEach((z) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.22, 0.06), M.steel);
      b.position.set(x0 + (n * dx) / 2 + 0.1, fl / 2 - 0.15, -z);
      b.rotation.z = ang;
      b.castShadow = true;
      r.add(b);
      const h = new THREE.Mesh(new THREE.BoxGeometry(len, 0.04, 0.04), M.steel);
      h.position.set(x0 + (n * dx) / 2 + 0.1, fl / 2 + 0.85, -z);
      h.rotation.z = ang;
      r.add(h);
    });
    box(7.35, 8.9, fl, fl + 1.0, 18.18, 18.22, M.steel, r);
    box(8.86, 8.9, fl, fl + 1.0, 17.0, 18.2, M.steel, r);
    box(8.0, 8.9, 0, fl - 0.12, 18.1, 18.18, M.steel, r);
  }

  /* ================= LIGHTS ================= */
  const hemi = new THREE.HemisphereLight(0xdde8f2, 0x8a7a66, 0.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0db, 2.3);
  sun.position.set(-9, 24, 14);
  sun.target.position.set(4.5, 0, -8.5);
  scene.add(sun);
  scene.add(sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, {
    left: -16,
    right: 16,
    top: 18,
    bottom: -18,
    near: 1,
    far: 70,
  });
  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.35);
  fill.position.set(14, 10, -30);
  scene.add(fill);
  const warm: [THREE.PointLight, number][] = [];
  function pl(x: number, y: number, z: number, i: number, d?: number, c?: number) {
    const l = new THREE.PointLight(c || 0xffd7a8, i, d || 6, 2);
    l.position.copy(V(x, y, z));
    scene.add(l);
    warm.push([l, i]);
    return l;
  }
  pl(1.9, H2 - 0.3, 8.0, 0.9);
  pl(1.9, H2 - 0.3, 10.6, 0.8);
  pl(6.5, H2 - 0.3, 4.3, 0.8);
  pl(2.0, H2 - 0.3, 14.8, 0.6);
  pl(5.6, H2 - 0.3, 14.8, 0.6);
  pl(5.5, H2 - 0.3, 10.7, 0.5);
  pl(4.5, H2 - 0.3, 12.3, 0.5);
  pl(6.6, H2 - 0.3, 8.6, 0.6);
  pl(6.4, W1 - 0.3, 3.8, 0.8, 7, 0xfff3e6);
  pl(2.2, W1 - 0.3, 5.0, 0.7, 8, 0xf4f6ff);
  pl(4.5, W1 - 0.3, 13.0, 0.9, 9, 0xf4f6ff);

  /* sky */
  const skyTexture = (() => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const g2 = c.getContext('2d')!;
    const gr = g2.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#7fa7c9');
    gr.addColorStop(0.55, '#bcd2e0');
    gr.addColorStop(1, '#e9e4da');
    g2.fillStyle = gr;
    g2.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  })();
  scene.background = skyTexture;
  scene.fog = new THREE.Fog(0xdfe3e2, 45, 120);

  /* ================= LABELS ================= */
  type Level = 'ground' | 'upper';
  const labelDefs: readonly (readonly [string, string, number, number, number, Level, boolean?])[] =
    [
      ['Rental warehouse', '≈ 87 m² clear, L-shaped', 2.0, 1.2, 6.0, 'ground'],
      ['Rear storage', 'rental', 3.2, 1.2, 13.0, 'ground'],
      ['WC', '2.0 × 2.0', 7.7, 1.2, 15.6, 'ground'],
      ['Private garage', '4.55 × 6.80', 6.4, 1.9, 3.5, 'ground'],
      ['U-stair', 'garage access only', 6.9, 2.2, 8.6, 'ground'],
      ['Front terrace', '9.0 × 2.0', 6.4, H1 + 0.4, 0.9, 'upper'],
      ['Side terrace', '4.0 × 4.3', 2.0, H1 + 0.4, 4.6, 'upper'],
      ['Lobby', 'enclosed, above garage', 6.4, H1 + 0.4, 4.0, 'upper'],
      ['Living', '3.4 m wide', 2.0, H1 + 0.4, 7.9, 'upper'],
      ['Kitchen / dining', '', 2.0, H1 + 0.4, 10.7, 'upper'],
      ['Bath', '3.4 × 1.5, skylight', 5.6, H1 + 0.4, 10.75, 'upper'],
      ['Laundry', '1.3 × 1.5', 8.05, H1 + 0.4, 11.0, 'upper'],
      ['Hall', '1.2 m clear', 4.5, H1 + 0.4, 12.4, 'upper'],
      ['Bedroom', '≈ 11.7 m²', 2.0, H1 + 0.4, 15.0, 'upper'],
      ['Bedroom', '≈ 11.7 m²', 5.6, H1 + 0.4, 15.0, 'upper'],
      ['Garden exit', 'provisional', 8.3, H1 + 0.4, 15.5, 'upper', true],
    ];
  const labels = labelDefs.map(([title, sub, x, y, z, lv, warn]) => {
    const d = document.createElement('div');
    d.className = `${LABEL_CLASS} ${warn ? 'bg-[rgba(255,236,200,0.95)]' : 'bg-white/86'}`;
    d.textContent = title;
    if (sub) {
      const small = document.createElement('small');
      small.className = 'block text-[11px] font-normal text-[#4d554f]';
      small.textContent = sub;
      d.appendChild(small);
    }
    labelLayer.appendChild(d);
    return { d, p: V(x, y, z), lv, on: false };
  });

  /* ================= VIEWS ================= */
  const VIEWS: Record<ViewName, { cam: THREE.Vector3; tgt: THREE.Vector3; mode: 'all' | Level }> = {
    front: { cam: V(1.5, 3.2, -17), tgt: V(4.8, 3.9, 4), mode: 'all' },
    aerial: { cam: V(-11, 20, -12), tgt: V(4.5, 2.5, 8.5), mode: 'all' },
    rear: { cam: V(14, 6.5, 31), tgt: V(4.5, 3.4, 14), mode: 'all' },
    terrace: { cam: V(2.7, H1 + 1.6, 0.45), tgt: V(1.7, H1 + 1.1, 6.0), mode: 'all' },
    upper: { cam: V(4.5, 23, -1.5), tgt: V(4.5, H1, 7.6), mode: 'upper' },
    ground: { cam: V(4.5, 21, -1.5), tgt: V(4.5, 0, 7.4), mode: 'ground' },
    living: { cam: V(3.35, H1 + 1.55, 10.9), tgt: V(1.0, H1 + 1.05, 7.0), mode: 'all' },
    kitchen: { cam: V(3.3, H1 + 1.6, 7.0), tgt: V(1.0, H1 + 1.0, 11.0), mode: 'all' },
    bedroom: { cam: V(3.45, H1 + 1.6, 13.2), tgt: V(1.0, H1 + 0.9, 15.6), mode: 'all' },
    lobby: { cam: V(8.3, H1 + 1.6, 6.7), tgt: V(4.8, H1 + 1.1, 2.8), mode: 'all' },
    garage: { cam: V(8.4, 2.6, 0.6), tgt: V(4.8, 1.2, 7.2), mode: 'all' },
  };
  let showLabels = false;
  let showNeighbours = true;
  let mode: 'all' | Level = 'all';
  function applyMode(m: 'all' | Level) {
    mode = m;
    const ground = m === 'ground';
    const upper = m === 'upper';
    G.roof.visible = !(ground || upper);
    G.upper.visible = G.upperFurn.visible = G.terrace.visible = G.slab.visible = !ground;
    G.rearStair.visible = !ground;
    G.neighbours.visible = showNeighbours && !(ground || upper);
    labels.forEach(
      (l) =>
        (l.on =
          (showLabels || ground || upper) &&
          ((ground && l.lv === 'ground') ||
            (upper && l.lv === 'upper') ||
            (m === 'all' && showLabels))),
    );
    requestRender();
  }

  let anim: {
    start: number;
    t: number;
    p0: THREE.Vector3;
    t0: THREE.Vector3;
    p1: THREE.Vector3;
    t1: THREE.Vector3;
    inside: boolean;
  } | null = null;
  function goTo(name: ViewName) {
    const v = VIEWS[name];
    applyMode(v.mode);
    const inside = INSIDE_VIEWS.includes(name);
    controls.minDistance = inside ? 0.3 : 2;
    controls.maxDistance = inside ? 6 : 80;
    camera.fov = inside ? 68 : name === 'upper' || name === 'ground' ? 42 : 48;
    camera.updateProjectionMatrix();
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      camera.position.copy(v.cam);
      controls.target.copy(v.tgt);
      anim = null;
      return;
    }
    anim = {
      start: performance.now(),
      t: 0,
      p0: camera.position.clone(),
      t0: controls.target.clone(),
      p1: v.cam,
      t1: v.tgt,
      inside,
    };
  }

  function setEvening(evening: boolean) {
    if (evening) {
      sun.color.set(0xffb27a);
      sun.intensity = 1.1;
      sun.position.set(-20, 7, 6);
      hemi.intensity = 0.28;
      hemi.color.set(0x9fb2cc);
      renderer.toneMappingExposure = 1.0;
      warm.forEach(([l, i]) => (l.intensity = i * 2.2));
      M.lampOn.emissiveIntensity = 2.2;
    } else {
      sun.color.set(0xfff0db);
      sun.intensity = 2.3;
      sun.position.set(-9, 24, 14);
      hemi.intensity = 0.5;
      hemi.color.set(0xdde8f2);
      renderer.toneMappingExposure = 0.82;
      warm.forEach(([l, i]) => (l.intensity = i));
      M.lampOn.emissiveIntensity = 1.2;
    }
  }

  camera.position.copy(VIEWS.front.cam);
  controls.target.copy(VIEWS.front.tgt);
  applyMode('all');

  /* ================= LOOP ================= */
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const tmp = new THREE.Vector3();

  function frame() {
    frameId = requestAnimationFrame(frame);
    if (anim) {
      anim.t = Math.min(1, (performance.now() - anim.start) / 1400);
      const k = ease(anim.t);
      // lift the path over the building so it doesn't fly through walls
      const lift = Math.sin(Math.PI * k) * (anim.inside ? 6 : 4);
      camera.position.lerpVectors(anim.p0, anim.p1, k);
      camera.position.y += lift * (anim.t < 1 ? 1 : 0);
      controls.target.lerpVectors(anim.t0, anim.t1, k);
      if (anim.t >= 1) anim = null;
    }
    controls.update();
    renderer.render(scene, camera);
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    labels.forEach((l) => {
      if (!l.on) {
        l.d.style.display = 'none';
        return;
      }
      tmp.copy(l.p).project(camera);
      if (tmp.z > 1 || tmp.x < -1.1 || tmp.x > 1.1 || tmp.y < -1.1 || tmp.y > 1.1) {
        l.d.style.display = 'none';
        return;
      }
      l.d.style.display = 'block';
      l.d.style.left = ((tmp.x + 1) / 2) * w + 'px';
      l.d.style.top = ((1 - tmp.y) / 2) * h + 'px';
    });
  }
  function start() {
    if (!frameId && visible) frame();
  }
  function stop() {
    cancelAnimationFrame(frameId);
    frameId = 0;
  }
  /** Draws one frame while the loop is paused, so toggles show immediately. */
  function requestRender() {
    if (!frameId) renderer.render(scene, camera);
  }

  const resizeObserver = new ResizeObserver(() => {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    requestRender();
  });
  resizeObserver.observe(stage);

  // The page scrolls past the model; stop drawing frames once it is out of view.
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) start();
    else stop();
  });
  visibilityObserver.observe(stage);

  start();

  return {
    goTo,
    setLabels(on) {
      showLabels = on;
      applyMode(mode);
    },
    setNeighbours(on) {
      showNeighbours = on;
      applyMode(mode);
    },
    setEvening(on) {
      setEvening(on);
      requestRender();
    },
    dispose() {
      stop();
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      controls.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      Object.values(M).forEach((material) => material.dispose());
      Object.values(T).forEach((texture) => texture.dispose());
      slatsH.dispose();
      skyTexture.dispose();
      (sun.shadow.map as THREE.WebGLRenderTarget | null)?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      labels.forEach((l) => l.d.remove());
    },
  };
}
