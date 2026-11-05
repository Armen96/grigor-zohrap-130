/**
 * The "House over storage" concept model, ported from the reference
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

/**
 * Plan coords: x from the left boundary (0) to the right one (10.8 at the street,
 * 10.0 at the rear wall), z 0 street → 14.7 rear wall → garden, y up.
 */
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

  /* ---------- plot boundary ---------- */
  // The left boundary is straight (x = 0). The right boundary angles inward:
  // 10.80 m at the street line, 10.00 m at the rear wall.
  const W_FRONT = 10.8;
  const W_REAR = 10.0;
  /** Revision 06: 14.70 m deep keeps the footprint under 40% of the 385.05 m² plot. */
  const D = 14.7;
  /** Outer face of the right party wall at depth z. */
  const XR = (z: number) => W_FRONT - ((W_FRONT - W_REAR) * z) / D;
  /** Plan strip from x0 to the right boundary (less `inset`), between z0 and z1. */
  const toRight = (x0: number, z0: number, z1: number, inset: number): Point[] => [
    [x0, z0],
    [XR(z0) - inset, z0],
    [XR(z1) - inset, z1],
    [x0, z1],
  ];
  /** Vertical prism from a plan polygon. */
  function prism(
    poly: readonly Point[],
    y0: number,
    y1: number,
    mat: THREE.Material,
    grp: THREE.Object3D,
  ) {
    return slab(poly, [], y1, y1 - y0, mat, grp);
  }
  /** Wall of thickness t along the angled right boundary; `grow` widens it on every side. */
  function rightWall(
    z0: number,
    z1: number,
    y0: number,
    y1: number,
    t: number,
    mat: THREE.Material,
    grp: THREE.Object3D,
    grow = 0,
  ) {
    const za = z0 - grow;
    const zb = z1 + grow;
    return prism(
      [
        [XR(za) - t - grow, za],
        [XR(za) + grow, za],
        [XR(zb) + grow, zb],
        [XR(zb) - t - grow, zb],
      ],
      y0,
      y1,
      mat,
      grp,
    );
  }
  const BLD: Point[] = toRight(0, 0, D, 0);

  /* Key lines along the depth (z), shared by both floors. */
  const Z_GARAGE = 6.3; // upstairs: kitchen back wall
  const Z_STAIR0 = Z_GARAGE + 0.15; // upstairs: middle zone starts
  const Z_STAIR1 = Z_STAIR0 + 2.6; // upstairs: middle zone | hall
  const Z_HALL = Z_STAIR1 + 0.15; // upper hall starts
  const Z_GAR2 = 11.2; // ground: storage pallets run to here
  const X_GW = 4.77; // ground: storage | garage wall (garage 5.10 m clear at its rear wall)
  // L-stair, open to the garage: flight 1 along the right wall rising toward the garden,
  // a corner landing, then flight 2 turning left and arriving upstairs at XS.
  const TR = 0.27; // stair going
  const R = H1 / 18; // stair rise
  const XL = 8.8; // flight 1 and the corner landing run from here to the right wall
  const XS = XL - 8 * TR; // top of flight 2 (upstairs arrival)
  const F2 = [Z_STAIR1 - 1.5, Z_STAIR1 - 0.4] as const; // flight 2 and the corner landing, in z
  const Z_F1 = F2[0] - 8 * TR; // first riser of flight 1
  // Garage 5.10–5.56 × 8.50 m clear from the street to Z_SH: two cars side by side at the
  // front, free space behind them (wide enough to drive in between the WC and the stair), the
  // L-stair along the right wall and the storage WC in the rear-left corner.
  const X_WC = X_GW + 0.15; // storage WC 1.35 × 1.55, door from the rear storage
  const Z_SH = 0.3 + 8.5; // garage | rear storage wall
  const Z_WC1 = Z_SH;
  const Z_WC0 = Z_WC1 - 1.55;
  const Z_BED = 10.55; // hall | bedrooms wall
  const Z_REAR = D - 0.3; // inner face of the rear wall
  const Z_TER = 2.0; // front terrace depth
  const Z_HOUSE = Z_TER + 0.3; // inner face of the upper front wall
  const Z_FRONT = Z_GARAGE; // living + kitchen | bath, corridor and stair
  const X_BATH = 3.0; // bath | corridor wall: bath 2.70 m wide
  const X_COR0 = X_BATH + 0.15; // corridor starts here
  const Z_LIV = 6.6; // living | bath wall, 0.30 m behind the kitchen wall (bath 3.80 m deep)
  const Z_B0 = Z_LIV + 0.15; // bath starts
  const X_COR1 = 5.5; // corridor | stair wall, with the stair door
  const X_B2 = 4.5; // bedroom 1 | bedroom 2 wall ends here
  const X_PASS = 8.7; // bedroom 2 | garden passage wall ends here

  /* ================= SITE ================= */
  box(-14, 25, -0.32, -0.12, -12, -2.6, M.asphalt, G.site, { cast: false });
  box(-14, 25, -0.12, 0, -2.6, -0.0, M.paving, G.site, { cast: false });
  box(-14, 25, -0.12, 0.02, -2.75, -2.6, M.coping, G.site, { cast: false });
  // lane markings
  for (let x = -12; x < 24; x += 4)
    box(x, x + 2, -0.119, -0.115, -7.4, -7.25, M.white, G.site, { cast: false });
  // garden: the plot keeps narrowing past the building
  slab(toRight(0, D, 27, 0), [], -0.02, 0.13, M.grass, G.site).castShadow = false;
  slab(toRight(0, D, D + 1.3, 0), [], 0.0, 0.15, M.paving, G.site).castShadow = false;
  box(-14, 0, -0.15, -0.03, 17.5, 27, M.grass, G.site, { cast: false });
  slab(
    [
      [XR(16), 16],
      [25, 16],
      [25, 27],
      [XR(27), 27],
    ],
    [],
    -0.03,
    0.12,
    M.grass,
    G.site,
  ).castShadow = false;
  // fences
  box(-0.05, 0.0, 0, 1.8, D, 27, M.fence, G.site);
  rightWall(D, 27, 0, 1.8, 0.05, M.fence, G.site);
  box(0, XR(27), 0, 1.8, 26.95, 27, M.fence, G.site);
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
  tree(2.4, 22.5, 1.2);
  tree(7.6, 24.5, 0.9);
  // street trees
  tree(-3, -1.6, 0.9);
  tree(14.5, -1.6, 1);

  /* ================= NEIGHBOURS ================= */
  box(-9, 0, 0, 7.4, 0.4, 17.4, M.nA, G.neighbours);
  box(-9.1, 0.02, 7.4, 7.7, 0.3, 17.5, M.coping, G.neighbours);
  for (let i = 0; i < 3; i++) {
    box(-8 + i * 2.8, -6.6 + i * 2.8, 1.0, 2.6, 0.33, 0.4, M.nWin, G.neighbours);
    box(-8 + i * 2.8, -6.6 + i * 2.8, 4.4, 6.0, 0.33, 0.4, M.nWin, G.neighbours);
  }
  // right neighbour follows the angled boundary
  prism(
    [
      [XR(-0.2), -0.2],
      [19.8, -0.2],
      [19.8, 16],
      [XR(16), 16],
    ],
    0,
    6.6,
    M.nB,
    G.neighbours,
  );
  prism(
    [
      [XR(-0.3) - 0.02, -0.3],
      [19.9, -0.3],
      [19.9, 16.1],
      [XR(16.1) - 0.02, 16.1],
    ],
    6.6,
    6.85,
    M.coping,
    G.neighbours,
  );
  for (let i = 0; i < 3; i++)
    box(11.8 + i * 2.8, 13.2 + i * 2.8, 3.9, 5.5, -0.27, -0.2, M.nWin, G.neighbours);
  box(12.0, 14.4, 0, 2.4, -0.27, -0.2, M.nWin, G.neighbours);
  box(15.3, 18.8, 0, 2.6, -0.27, -0.2, M.roller, G.neighbours);

  /* ================= GROUND FLOOR ================= */
  const g = G.ground;
  slab(BLD, [], 0, 0.12, M.concrete, g).castShadow = false;
  // outer side walls (blind); the right one follows the angled boundary
  box(0, 0.3, 0, W1, 0, D, M.plasterBase, g);
  rightWall(0, D, 0, W1, 0.3, M.plasterBase, g);
  // front wall: storage gate, garage door, home entry door
  wallX(
    0,
    W_FRONT,
    0,
    0.3,
    0,
    W1,
    [
      [0.6, 4.4, 0, 3.0],
      [4.95, 9.75, 0, 2.5],
    ],
    M.plasterBase,
    g,
  );
  // wood cladding band above the double garage door
  box(4.75, 10.6, 2.72, W1, -0.04, 0.0, M.clad, g);
  // rear wall
  wallX(
    0,
    XR(D),
    Z_REAR,
    D,
    0,
    W1,
    [
      [0.9, 3.3, 2.0, 3.0],
      [4.6, 6.4, 2.0, 3.0],
      [8.4, 9.2, 2.3, 2.9],
    ],
    M.plasterBase,
    g,
  );
  const zg = Z_REAR + 0.15;
  glazeX(0.9, 3.3, zg, 2.0, 3.0, g, 2, 0.15);
  glazeX(4.6, 6.4, zg, 2.0, 3.0, g, 1, 0.15);
  glazeX(8.4, 9.2, zg, 2.3, 2.9, g, 1, 0.15);
  // storage | garage walls (fire-rated): a plain rectangle. The rear one has the WC door,
  // opening from the rear storage.
  box(X_GW, X_GW + 0.15, 0, W1, 0.3, Z_SH + 0.15, M.wallIn, g);
  wallX(
    X_GW,
    XR(Z_SH) - 0.15,
    Z_SH,
    Z_SH + 0.15,
    0,
    W1,
    [[X_WC + 0.05, X_WC + 0.8, 0, 2.05]],
    M.wallIn,
    g,
  );
  // closes the strip between flight 2 and the rear wall above the WC
  for (let j = 1; j <= 8; j++) {
    const xa = XL - j * TR;
    const xb = XL - (j - 1) * TR;
    box(xa, xb, (9 + j) * R - 0.45, W1, F2[1], F2[1] + 0.05, M.wallIn, g);
  }
  // gates and doors (front)
  box(0.6, 4.4, 0, 3.0, 0.05, 0.1, M.roller, g); // roller gate (storage)
  box(0.5, 4.5, 3.0, 3.18, -0.02, 0.1, M.alu, g); // gate box
  box(4.95, 9.75, 0, 2.5, 0.06, 0.1, M.cladH, g); // timber sectional double garage door
  for (let i = 1; i < 4; i++)
    box(4.95, 9.75, i * 0.625 - 0.01, i * 0.625 + 0.01, 0.04, 0.06, M.alu, g);
  box(8.75, 9.6, 0.02, 2.05, 0.03, 0.06, M.walnut, g); // pass door built into the garage door
  box(8.83, 8.87, 0.95, 1.3, 0.0, 0.03, M.chrome, g);
  box(4.75, 10.6, 2.62, 2.72, -0.65, 0.0, M.alu, g); // small canopy over garage + entry
  (
    [
      [4.6, 2.6],
      [10.55, 2.4],
    ] as const
  ).forEach(([x, y]) =>
    box(x - 0.06, x + 0.06, y, y + 0.2, -0.06, 0, M.lampOn, g, { cast: false }),
  );
  box(10.4, 10.7, 2.0, 2.15, -0.05, -0.04, M.black, g); // house number
  // L-stair, open to the garage (no enclosure on the ground floor)
  for (let i = 1; i <= 8; i++) {
    const z0 = Z_F1 + (i - 1) * TR;
    const z1 = z0 + TR;
    box(XL, XR(z1) - 0.3, 0, i * R, z0, z1, M.concrete, g);
    box(XL - 0.02, XR(z1) - 0.3, i * R, i * R + 0.03, z0 - 0.02, z1, M.oakFurn, g);
  }
  box(XL, XR(F2[1]) - 0.3, 0, 9 * R, F2[0], F2[1], M.concrete, g); // corner landing
  box(XL, XR(F2[1]) - 0.3, 9 * R, 9 * R + 0.03, F2[0], F2[1], M.oakFurn, g);
  for (let j = 1; j <= 8; j++) {
    const xa = XL - j * TR;
    const xb = XL - (j - 1) * TR;
    const top = 9 * R + j * R;
    box(xa, xb, top - 0.45, top, F2[0], F2[1], M.concrete, g);
    box(xa - 0.02, xb, top, top + 0.03, F2[0], F2[1], M.oakFurn, g);
  }
  // handrails on the open sides
  {
    const rail = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
      const a = V(x0, y0, z0);
      const b = V(x1, y1, z1);
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, a.distanceTo(b), 8),
        M.steel,
      );
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      g.add(m);
      [a, b].forEach((p) => cyl(p.x, p.y - 0.9, p.y, -p.z, 0.02, M.steel, g, 6));
    };
    rail(XL - 0.05, 0.9, Z_F1, XL - 0.05, 9 * R + 0.9, F2[0]);
    rail(XL, 9 * R + 0.9, F2[0] - 0.05, XS, H1 + 0.9, F2[0] - 0.05);
  }
  // storage WC 1.35 × 1.55 in the garage's rear-left corner, door in the rear wall
  box(X_WC, X_WC + 1.5, 0, W1, Z_WC0 - 0.15, Z_WC0, M.wallIn, g);
  box(X_WC + 1.35, X_WC + 1.5, 0, W1, Z_WC0, Z_WC1, M.wallIn, g);

  /* ground furniture: car, racks, WC */
  const gf = G.groundFurn;
  function car(x0: number, x1: number, z0: number, z1: number) {
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
  }
  car(5.3, 7.1, 0.45, 4.95); // two cars side by side, 2.20 × 4.70 m each
  car(7.9, 9.7, 0.45, 4.95);
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
  rackRun(0.45, 7.35, Z_REAR - 1.1, Z_REAR - 0.1, 3, 2.9); // along rear wall
  for (let z = 1.0; z < 9.0; z += 1.35) {
    box(0.45, 1.55, 0, 0.15, z, z + 1.2, M.pallet, gf);
    box(0.5, 1.5, 0.15, 0.15 + rnd(0.5, 1.1), z + 0.05, z + 1.15, M.carton, gf);
  }
  for (let z = 1.0; z < 9.0; z += 1.35) {
    box(X_GW - 1.25, X_GW - 0.15, 0, 0.15, z, z + 1.2, M.pallet, gf);
    box(X_GW - 1.2, X_GW - 0.2, 0.15, 0.15 + rnd(0.5, 1.1), z + 0.05, z + 1.15, M.carton, gf);
  }
  for (let z = 8.9; z < Z_GAR2 - 1.0; z += 1.35) {
    box(2.2, 3.3, 0, 0.15, z, z + 1.2, M.pallet, gf);
    box(2.25, 3.25, 0.15, 0.15 + rnd(0.4, 1), z + 0.05, z + 1.15, M.carton, gf);
  }
  box(X_WC + 0.7, X_WC + 1.35, 0, 0.42, Z_WC0 + 0.05, Z_WC0 + 0.5, M.white, gf); // WC
  box(X_WC + 1.2, X_WC + 1.35, 0.42, 0.8, Z_WC0 + 0.05, Z_WC0 + 0.5, M.white, gf);
  box(X_WC, X_WC + 0.4, 0.8, 0.95, Z_WC0 + 0.4, Z_WC0 + 0.8, M.white, gf); // basin

  /* ================= UPPER SLAB + TERRACE ================= */
  // the upstairs floor covers the corner beside flight 1; only the flights are open
  const stairHole: Point[] = [
    [XS, F2[0]],
    [XL, F2[0]],
    [XL, Z_STAIR0],
    [XR(Z_STAIR0) - 0.3, Z_STAIR0],
    [XR(F2[1]) - 0.3, F2[1]],
    [XS, F2[1]],
  ];
  slab(BLD, [stairHole], H1, SLAB, M.slab, G.slab);
  box(0, W_FRONT, W1 - 0.02, W1, 0, 0.02, M.coping, G.slab); // drip line
  // front terrace decking across the full width
  slab(toRight(0.25, 0.2, Z_TER, 0.25), [], H1 + 0.03, 0.03, M.deck, G.terrace).castShadow = false;
  // front upstand + frameless glass railing
  box(0.25, 10.55, H1, H1 + 0.25, 0, 0.2, M.plaster, G.terrace);
  box(0.25, 10.55, H1 + 0.25, H1 + 0.27, 0, 0.2, M.coping, G.terrace);
  box(0.27, 10.53, H1 + 0.27, H1 + 1.1, 0.08, 0.1, M.glassRail, G.terrace, { cast: false });
  box(0.25, 10.55, H1 + 1.08, H1 + 1.12, 0.06, 0.12, M.alu, G.terrace);
  // privacy walls on boundaries (no openings to neighbours)
  box(0, 0.25, H1, H1 + 1.8, 0, Z_TER, M.plaster, G.terrace);
  box(0, 0.25, H1 + 1.8, H1 + 1.84, 0, Z_TER, M.coping, G.terrace);
  rightWall(0, Z_TER, H1, H1 + 1.8, 0.25, M.plaster, G.terrace);
  rightWall(0, Z_TER, H1 + 1.8, H1 + 1.84, 0.25, M.coping, G.terrace);
  // terrace furniture
  {
    const t = G.terrace;
    const tf = H1 + 0.03;
    // dining in front of the living room
    box(1.0, 2.6, tf + 0.72, tf + 0.76, 0.55, 1.45, M.oakFurn, t);
    box(1.05, 1.12, tf, tf + 0.72, 0.6, 1.4, M.oakFurn, t);
    box(2.48, 2.55, tf, tf + 0.72, 0.6, 1.4, M.oakFurn, t);
    (
      [
        [1.3, 0.35],
        [2.1, 0.35],
        [1.3, 1.65],
        [2.1, 1.65],
      ] as const
    ).forEach(([x, z]) => {
      box(x - 0.22, x + 0.22, tf + 0.42, tf + 0.46, z - 0.2, z + 0.2, M.alu, t);
      box(x - 0.22, x + 0.22, tf, tf + 0.42, z - 0.02, z + 0.02, M.alu, t);
    });
    // two lounge chairs and a side table in front of the kitchen
    [7.0, 8.6].forEach((x) => {
      box(x, x + 0.75, tf, tf + 0.32, 0.45, 1.5, M.oakFurn, t);
      box(x + 0.03, x + 0.72, tf + 0.32, tf + 0.42, 0.5, 1.45, M.linen, t);
      box(x + 0.03, x + 0.72, tf + 0.32, tf + 0.75, 1.3, 1.45, M.linen, t);
    });
    cyl(8.2, tf, tf + 0.45, 0.95, 0.2, M.oakFurn, t, 16);
    // planters
    (
      [
        [3.3, 0.6],
        [5.6, 0.6],
        [10.1, 0.6],
      ] as const
    ).forEach(([x, z]) => {
      box(x - 0.3, x + 0.3, tf, tf + 0.5, z - 0.3, z + 0.3, M.coping, t);
      foliage(0.42, M.leaf, x, tf + 0.85, z, t);
    });
  }

  /* ================= UPPER FLOOR ================= */
  // Street side: living + kitchen across the full width, onto the terrace.
  // Middle: bath against the bedroom wall, a corridor, and the stair behind its own door.
  // Garden side: hall, two bedrooms and a 1 m passage to the garden door.
  const u = G.upper;
  const fl = H1;
  const ZB = Z_BED + 0.15; // bedrooms start
  const ZM = Z_STAIR1; // middle block | hall wall
  // interior floors
  slab(toRight(0.3, Z_HOUSE, Z_FRONT, 0.3), [], fl + 0.02, 0.02, M.oak, u).castShadow = false; // living + kitchen
  box(0.3, X_COR0, fl, fl + 0.02, Z_FRONT, Z_LIV, M.oak, u, { cast: false }); // deeper living
  box(X_COR0, XS, fl, fl + 0.02, Z_FRONT, ZM, M.oak, u, { cast: false }); // corridor + stair landing
  box(XS, XL, fl, fl + 0.02, Z_STAIR0, F2[0], M.oak, u, { cast: false }); // landing beside flight 1
  box(XS, XR(ZM) - 0.3, fl, fl + 0.02, F2[1], ZM, M.oak, u, { cast: false }); // strip behind flight 2
  slab(toRight(0.3, ZM, Z_REAR, 0.3), [], fl + 0.02, 0.02, M.oak, u).castShadow = false; // hall + bedrooms
  box(0.3, X_BATH, fl, fl + 0.03, Z_B0, Z_BED, M.tile, u, { cast: false }); // bath
  // side walls (blind)
  box(0, 0.3, fl, H2, Z_TER, D, M.plaster, u);
  rightWall(Z_TER, D, fl, H2, 0.3, M.plaster, u);
  // rear wall: two bedroom windows + garden door at the end of the passage
  wallX(
    0,
    XR(D),
    Z_REAR,
    D,
    fl,
    H2,
    [
      [0.95, 3.65, fl + 0.9, fl + 2.35],
      [5.15, 7.85, fl + 0.9, fl + 2.35],
      [8.85, 9.6, fl, fl + 2.2],
    ],
    M.plaster,
    u,
  );
  glazeX(0.95, 3.65, zg, fl + 0.9, fl + 2.35, u, 2, 0.2);
  glazeX(5.15, 7.85, zg, fl + 0.9, fl + 2.35, u, 2, 0.2);
  box(8.85, 9.6, fl, fl + 2.2, Z_REAR + 0.1, Z_REAR + 0.16, M.walnut, u);
  // front wall onto the terrace: living slider and kitchen slider
  const frontOps: Opening[] = [
    [0.55, 3.95, fl, fl + 2.45],
    [5.0, 9.8, fl, fl + 2.45],
  ];
  wallX(0, XR(Z_TER), Z_TER, Z_HOUSE, fl, H2, frontOps, M.plaster, u);
  const zf = Z_TER + 0.15;
  glazeX(0.55, 3.95, zf, fl, fl + 2.45, u, 2, 0);
  glazeX(5.0, 9.8, zf, fl, fl + 2.45, u, 3, 0);
  // timber reveal frame around the living opening
  box(0.45, 4.05, fl + 2.45, fl + 2.6, Z_TER - 0.06, Z_TER, M.clad, u);
  box(0.45, 0.55, fl, fl + 2.6, Z_TER - 0.06, Z_TER, M.clad, u);
  box(3.95, 4.05, fl, fl + 2.6, Z_TER - 0.06, Z_TER, M.clad, u);
  // wood cladding on the facade above the garage
  wallX(4.4, XR(Z_TER - 0.05), Z_TER - 0.05, Z_TER, fl, H2, frontOps.slice(1), M.clad, u);
  // back wall of the living room (bath and corridor behind it), with the door from the corridor
  wallX(0.3, X_COR1 + 0.1, Z_LIV, Z_B0, fl, H2, [[3.7, 5.1, fl, fl + 2.1]], M.wallIn, u);
  casingX(3.7, 5.1, Z_LIV, Z_B0, fl + 2.1, u);
  // back wall of the kitchen (the stair is behind it, so it stays put)
  box(X_COR1, XR(Z_FRONT) - 0.15, fl, H2, Z_FRONT, Z_STAIR0, M.wallIn, u);
  // bath | corridor, with the bath door near the bedrooms
  wallZ(Z_B0, Z_BED, X_BATH, X_COR0, fl, H2, [[9.5, 10.3, fl, fl + 2.1]], M.wallIn, u);
  casingZ(9.5, 10.3, X_BATH - 0.02, X_COR0 + 0.02, fl + 2.1, u);
  // the stair behind its own door: wall on the corridor side, door at the top landing
  wallZ(
    Z_STAIR0,
    ZM,
    X_COR1,
    X_COR1 + 0.1,
    fl,
    H2,
    [[F2[0] + 0.15, F2[1] - 0.1, fl, fl + 2.1]],
    M.wallIn,
    u,
  );
  box(X_COR1 + 0.03, X_COR1 + 0.07, fl, fl + 2.1, F2[0] + 0.15, F2[1] - 0.1, M.walnut, u); // stair door
  box(X_COR1 + 0.07, X_COR1 + 0.1, fl + 0.95, fl + 1.0, F2[1] - 0.3, F2[1] - 0.2, M.chrome, u);
  box(X_COR1, XR(Z_STAIR1) - 0.15, fl, H2, Z_STAIR1, Z_HALL, M.wallIn, u); // stair | hall
  // guards around the stair opening
  box(XS, XL, fl, fl + 1.0, F2[0] - 0.015, F2[0] + 0.015, M.glassRail, u, { cast: false });
  box(XS, XL, fl + 0.97, fl + 1.0, F2[0] - 0.03, F2[0] + 0.03, M.oakFurn, u);
  box(XL - 0.015, XL + 0.015, fl, fl + 1.0, Z_STAIR0, F2[0], M.glassRail, u, { cast: false });
  box(XL - 0.03, XL + 0.03, fl + 0.97, fl + 1.0, Z_STAIR0, F2[0], M.oakFurn, u);
  box(XS, XR(F2[1]) - 0.3, fl, fl + 1.0, F2[1] - 0.015, F2[1] + 0.015, M.glassRail, u, {
    cast: false,
  });
  box(XS, XR(F2[1]) - 0.3, fl + 0.97, fl + 1.0, F2[1] - 0.03, F2[1] + 0.03, M.oakFurn, u);
  // hall | bedrooms + passage
  wallX(
    0.3,
    XR(Z_BED) - 0.15,
    Z_BED,
    ZB,
    fl,
    H2,
    [
      [3.45, 4.25, fl, fl + 2.1],
      [4.65, 5.45, fl, fl + 2.1],
      [X_PASS, XR(ZB) - 0.3, fl, fl + 2.3],
    ],
    M.wallIn,
    u,
  );
  casingX(3.45, 4.25, Z_BED, ZB, fl + 2.1, u);
  casingX(4.65, 5.45, Z_BED, ZB, fl + 2.1, u);
  box(X_B2 - 0.15, X_B2, fl, H2, ZB, Z_REAR, M.wallIn, u); // bedroom | bedroom
  box(X_PASS - 0.15, X_PASS, fl, H2, ZB, Z_REAR, M.wallIn, u); // bedroom 2 | passage

  /* upper furniture */
  const f = G.upperFurn;
  const F = fl + 0.02;
  // living, facing the terrace
  box(0.6, 3.7, F, F + 0.01, 3.3, 6.2, M.rug, f, { cast: false });
  box(0.5, 2.9, F, F + 0.42, 5.6, 6.5, M.sofa, f);
  box(0.5, 2.9, F + 0.42, F + 0.85, 6.25, 6.5, M.sofa, f);
  box(0.5, 0.7, F + 0.42, F + 0.62, 5.6, 6.5, M.sofa, f);
  box(2.7, 2.9, F + 0.42, F + 0.62, 5.6, 6.5, M.sofa, f);
  box(0.72, 1.68, F + 0.42, F + 0.52, 5.65, 6.23, M.linen, f);
  box(1.72, 2.68, F + 0.42, F + 0.52, 5.65, 6.23, M.linen, f);
  box(0.9, 1.3, F + 0.5, F + 0.82, 6, 6.22, M.clay, f);
  box(2.2, 2.6, F + 0.5, F + 0.82, 6, 6.22, M.olive, f);
  box(1.1, 2.4, F, F + 0.36, 4.2, 4.9, M.walnut, f); // coffee table
  cyl(1.75, F + 0.36, F + 0.5, 4.55, 0.09, M.clay, f, 14, 0.06);
  box(3.0, 3.75, F, F + 0.42, 3.6, 4.35, M.sofa, f); // armchair
  box(3.6, 3.75, F + 0.42, F + 0.8, 3.6, 4.35, M.sofa, f);
  box(0.3, 0.7, F, F + 0.5, 2.9, 4.9, M.walnut, f); // media unit on the party wall
  box(0.3, 0.34, F + 0.9, F + 1.65, 3.3, 4.6, M.black, f);
  cyl(0.6, F, F + 1.55, 5.0, 0.015, M.black, f, 8);
  cyl(0.6, F + 1.45, F + 1.7, 5.0, 0.14, M.lampOn, f, 16, 0.18);
  cyl(3.65, F, F + 0.45, 2.7, 0.17, M.pot, f, 14);
  foliage(0.42, M.leaf, 3.65, F + 1.0, 2.7, f);
  // kitchen along the stair-side wall, dining in front of it
  const ZK = Z_FRONT - 0.6;
  box(6.8, 9.4, F, F + 0.86, ZK, Z_FRONT, M.oakFurn, f);
  box(6.8, 9.4, F + 0.86, F + 0.9, ZK, Z_FRONT, M.counter, f);
  box(6.8, 9.4, F + 0.9, F + 1.5, Z_FRONT - 0.02, Z_FRONT, M.terracotta, f);
  box(6.8, 9.4, F + 1.5, F + 2.25, Z_FRONT - 0.35, Z_FRONT, M.oakFurn, f);
  box(9.4, XR(Z_FRONT) - 0.35, F, F + 2.25, ZK - 0.05, Z_FRONT, M.white, f); // tall fridge unit
  box(8.3, 8.9, F + 0.9, F + 0.92, ZK + 0.08, ZK + 0.52, M.black, f); // hob
  box(7.2, 7.4, F + 0.9, F + 0.96, ZK + 0.35, ZK + 0.5, M.chrome, f); // tap/sink
  const DX = 7.0;
  const DZ = 3.4;
  box(DX, DX + 1.8, F + 0.73, F + 0.77, DZ, DZ + 0.9, M.oakFurn, f);
  box(DX + 0.15, DX + 1.65, F, F + 0.73, DZ + 0.4, DZ + 0.5, M.walnut, f);
  (
    [
      [DX + 0.45, DZ - 0.2],
      [DX + 1.35, DZ - 0.2],
      [DX + 0.45, DZ + 1.1],
      [DX + 1.35, DZ + 1.1],
    ] as const
  ).forEach(([x, z]) => {
    box(x - 0.2, x + 0.2, F + 0.44, F + 0.48, z - 0.21, z + 0.21, M.walnut, f);
    for (const dx of [-0.17, 0.17])
      for (const dz of [-0.18, 0.18])
        box(x + dx - 0.02, x + dx + 0.02, F, F + 0.44, z + dz - 0.02, z + dz + 0.02, M.walnut, f);
    const back = z < DZ ? z - 0.22 : z + 0.18;
    box(x - 0.2, x + 0.2, F + 0.48, F + 0.86, back, back + 0.04, M.walnut, f);
  });
  cyl(DX + 0.9, H2 - 0.9, H2, DZ + 0.45, 0.004, M.black, f, 4);
  cyl(DX + 0.9, H2 - 1.12, H2 - 0.9, DZ + 0.45, 0.04, M.lampOn, f, 20, 0.22);
  // bath (2.70 × 3.80): tub, shower, double vanity, WC, washing machine
  box(0.3, 1.9, F, F + 0.55, Z_B0, Z_B0 + 0.75, M.white, f); // bathtub
  box(0.4, 1.8, F + 0.5, F + 0.56, Z_B0 + 0.08, Z_B0 + 0.67, M.glass, f, { cast: false });
  box(2.0, 2.02, F, F + 2.0, Z_B0, Z_B0 + 1.0, M.glassRail, f, { cast: false }); // shower screen
  box(2.0, X_BATH, F, F + 2.0, Z_B0 + 1.0, Z_B0 + 1.02, M.glassRail, f, { cast: false });
  cyl(2.5, F + 1.9, F + 1.95, Z_B0 + 0.45, 0.12, M.chrome, f, 16);
  box(0.3, 0.85, F + 0.5, F + 0.85, 7.95, 9.15, M.oakFurn, f); // double vanity
  box(0.35, 0.8, F + 0.85, F + 0.9, 8.0, 8.5, M.white, f);
  box(0.35, 0.8, F + 0.85, F + 0.9, 8.6, 9.1, M.white, f);
  box(0.3, 0.32, F + 1.1, F + 1.9, 7.95, 9.15, M.chrome, f); // mirror
  box(0.3, 0.9, F, F + 0.42, 9.45, 9.9, M.white, f); // WC
  box(0.3, 0.45, F + 0.42, F + 0.8, 9.45, 9.9, M.white, f);
  box(1.3, 1.9, F, F + 0.85, Z_BED - 0.6, Z_BED, M.white, f); // washing machine
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 24), M.black);
  drum.rotation.x = Math.PI / 2;
  drum.position.set(1.6, F + 0.45, -(Z_BED - 0.61));
  f.add(drum);
  box(1.3, 1.9, F + 0.85, F + 0.88, Z_BED - 0.6, Z_BED, M.counter, f);
  // corridor: ceiling light
  cyl((X_COR0 + X_COR1) / 2, H2 - 0.06, H2, 7.8, 0.18, M.lampOn, f, 24);
  // stair landing: shoe cabinet beside flight 1
  box(XS + 0.2, XL - 0.2, F, F + 0.9, Z_STAIR0, Z_STAIR0 + 0.4, M.oakFurn, f);
  // hall
  box(7.0, 7.4, F, F + 0.8, Z_HALL + 0.05, Z_HALL + 0.4, M.walnut, f);
  // bedroom 1 (4.05 x 3.70)
  const bz = (z: number) => z - 2.3; // bedroom furniture as in Revision 05, 2.30 m nearer the street
  box(0.3, 2.85, F, H2 - 0.05, bz(13.0), bz(13.6), M.oakFurn, f);
  for (let x = 0.82; x < 2.8; x += 0.51)
    box(x - 0.005, x + 0.005, F + 0.05, H2 - 0.08, bz(13.6), bz(13.61), M.walnut, f);
  box(0.3, 0.38, F, F + 1.15, bz(14.2), bz(15.9), M.sofa, f);
  box(0.38, 2.4, F, F + 0.32, bz(14.25), bz(15.85), M.walnut, f);
  box(0.4, 2.38, F + 0.32, F + 0.55, bz(14.3), bz(15.8), M.white, f);
  box(0.95, 2.4, F + 0.55, F + 0.6, bz(14.28), bz(15.82), M.linen, f);
  box(1.9, 2.42, F + 0.56, F + 0.64, bz(14.27), bz(15.83), M.clay, f);
  box(0.45, 0.85, F + 0.55, F + 0.72, bz(14.4), bz(14.95), M.white, f);
  box(0.45, 0.85, F + 0.55, F + 0.72, bz(15.15), bz(15.7), M.white, f);
  [13.75, 16.0].forEach((z) => {
    box(0.3, 0.75, F, F + 0.5, bz(z), bz(z + 0.45), M.walnut, f);
    cyl(0.52, F + 0.5, F + 0.75, bz(z + 0.22), 0.09, M.lampOn, f, 14, 0.12);
  });
  box(1.0, 3.3, F, F + 0.01, bz(14.0), bz(16.3), M.rug, f, { cast: false });
  box(3.75, 4.35, F + 0.73, F + 0.77, bz(14.4), bz(15.8), M.oakFurn, f); // desk on the partition
  box(3.77, 4.33, F, F + 0.73, bz(14.42), bz(14.48), M.oakFurn, f);
  box(3.77, 4.33, F, F + 0.73, bz(15.72), bz(15.78), M.oakFurn, f);
  // bedroom 2 (4.05 x 3.70), Revision 05 furniture moved 0.30 m right
  const b2 = (x: number) => x + 0.3;
  box(b2(5.7), b2(8.25), F, H2 - 0.05, bz(13.0), bz(13.6), M.oakFurn, f);
  for (let x = 6.2; x < 8.2; x += 0.51)
    box(b2(x) - 0.005, b2(x) + 0.005, F + 0.05, H2 - 0.08, bz(13.6), bz(13.61), M.walnut, f);
  box(b2(8.17), b2(8.25), F, F + 1.15, bz(14.2), bz(15.9), M.sofa, f);
  box(b2(6.15), b2(8.17), F, F + 0.32, bz(14.25), bz(15.85), M.walnut, f);
  box(b2(6.17), b2(8.15), F + 0.32, F + 0.55, bz(14.3), bz(15.8), M.white, f);
  box(b2(6.15), b2(7.6), F + 0.55, F + 0.6, bz(14.28), bz(15.82), M.olive, f);
  box(b2(7.7), b2(8.1), F + 0.55, F + 0.72, bz(14.4), bz(15.7), M.white, f);
  box(b2(4.45), b2(5.55), F + 0.73, F + 0.77, bz(16.1), bz(16.65), M.oakFurn, f);
  box(b2(4.47), b2(4.53), F, F + 0.73, bz(16.12), bz(16.62), M.oakFurn, f);
  box(b2(5.47), b2(5.53), F, F + 0.73, bz(16.12), bz(16.62), M.oakFurn, f);
  box(b2(4.8), b2(5.2), F + 0.42, F + 0.46, bz(15.6), bz(16.0), M.walnut, f);
  box(b2(4.8), b2(5.2), F + 0.46, F + 0.85, bz(15.56), bz(15.6), M.walnut, f);

  /* ================= ROOF ================= */
  const roofPoly = toRight(0, Z_TER, D, 0);
  const skys = [
    rect(7.2, Z_STAIR0 + 0.4, 9.0, Z_STAIR1 - 0.4), // stair
    rect(0.8, 7.7, 2.6, 9.2), // bath
    rect(5.4, Z_HALL + 0.25, 6.8, Z_BED - 0.25), // hall
    rect(7.3, 3.2, 9.0, 4.6), // dining
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
  const parapets: (readonly [number, number, number, number])[] = [
    [0, XR(Z_TER) - 0.1, Z_TER, Z_TER + pt],
    [0, XR(D) - 0.1, D - pt, D],
    [0, pt, Z_TER, D],
  ];
  parapets.forEach(([a, b, c, d]) => {
    box(a, b, ROOF, PARA, c, d, pm, G.roof);
    box(a - 0.02, b + 0.02, PARA, PARA + 0.05, c - 0.02, d + 0.02, M.coping, G.roof);
  });
  rightWall(Z_TER, D, ROOF, PARA, pt, pm, G.roof);
  rightWall(Z_TER, D, PARA, PARA + 0.05, pt, M.coping, G.roof, 0.02);
  // wood cladding continues up the parapet above the garage
  box(4.4, XR(Z_TER - 0.05), ROOF, PARA, Z_TER - 0.05, Z_TER, M.clad, G.roof);
  // roof plant + gravel
  slab(
    toRight(0.2, Z_TER + 0.2, D - 0.2, 0.2),
    skys,
    ROOF + 0.04,
    0.04,
    M.concrete,
    G.roof,
  ).castShadow = false;
  box(7.6, 8.8, ROOF, ROOF + 0.7, 11.8, 12.8, M.chrome, G.roof);
  box(1.0, 2.2, ROOF, ROOF + 0.35, 12.6, 13.3, M.white, G.roof);
  // solar water heater / pv frame
  box(1.0, 3.6, ROOF + 0.3, ROOF + 0.36, 10.6, 12.0, M.carGlass, G.roof);
  box(1.0, 3.6, ROOF, ROOF + 0.3, 11.9, 12.0, M.steel, G.roof);

  /* ================= PROVISIONAL REAR GARDEN STAIR ================= */
  {
    const r = G.rearStair;
    box(8.35, 9.85, fl - 0.12, fl, D, D + 1.2, M.steel, r); // landing
    const n = 18;
    const dx = 0.26;
    for (let i = 1; i < n; i++) {
      const y = fl - i * R;
      const x = 8.35 - i * dx;
      box(x, x + dx + 0.02, y - 0.04, y, D + 0.05, D + 1.05, M.steel, r);
    }
    const x0 = 8.35 - n * dx;
    const len = Math.hypot(n * dx, fl);
    const ang = Math.atan2(fl, n * dx);
    [D + 0.05, D + 1.05].forEach((z) => {
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
    box(8.35, 9.85, fl, fl + 1.0, D + 1.18, D + 1.22, M.steel, r);
    box(9.81, 9.85, fl, fl + 1.0, D, D + 1.2, M.steel, r);
    box(9.0, 9.85, 0, fl - 0.12, D + 1.1, D + 1.18, M.steel, r);
  }

  /* ================= LIGHTS ================= */
  const hemi = new THREE.HemisphereLight(0xdde8f2, 0x8a7a66, 0.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0db, 2.3);
  sun.position.set(-9, 24, 14);
  sun.target.position.set(5.2, 0, -8.5);
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
  pl(2.1, H2 - 0.3, 4.4, 0.9);
  pl(7.9, H2 - 0.3, 4.4, 0.8);
  pl(5.0, H2 - 0.3, 7.7, 0.6);
  pl(2.25, H2 - 0.3, 12.5, 0.6);
  pl(6.5, H2 - 0.3, 12.5, 0.6);
  pl(1.65, H2 - 0.3, 8.6, 0.6);
  pl(5.5, H2 - 0.3, 9.9, 0.5);
  pl(9.2, H2 - 0.3, 11.8, 0.3);
  pl(7.2, W1 - 0.3, 4.0, 0.8, 8, 0xfff3e6);
  pl(2.4, W1 - 0.3, 5.0, 0.7, 8, 0xf4f6ff);
  pl(5.0, W1 - 0.3, 12.8, 0.9, 9, 0xf4f6ff);

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
      ['Storage', '≈ 91 m² + WC', 2.5, 1.2, 5.0, 'ground'],
      ['Rear storage', '9.4–9.7 × 5.45', 5.0, 1.2, 12.0, 'ground'],
      ['WC (storage)', '1.35 × 1.55, door from rear storage', 5.6, 1.2, 8.0, 'ground'],
      ['Free space', '2.4 m wide between WC and stair', 7.6, 1.2, 6.8, 'ground'],
      ['Private garage', '5.1 × 8.5, 2 cars side by side', 7.5, 1.9, 2.6, 'ground'],
      ['L-stair', '1.1–1.4 wide, turns left', 9.3, 2.2, 6.5, 'ground'],
      ['Front terrace', '10.8 → 10.7 × 2.0', 5.6, H1 + 0.4, 0.9, 'upper'],
      ['Living', '5.2 × 4.3', 2.0, H1 + 0.4, 3.6, 'upper'],
      ['Kitchen / dining', '4.65–4.85 × 4.0', 7.9, H1 + 0.4, 4.9, 'upper'],
      ['Stair door', 'stair closed off', 6.1, H1 + 0.4, 8.5, 'upper'],
      ['Corridor', '2.35 m wide', 4.3, H1 + 0.4, 7.6, 'upper'],
      ['Bath', '2.7 × 3.8, tub + shower', 1.65, H1 + 0.4, 8.6, 'upper'],
      ['Hall', '1.35 m clear', 5.5, H1 + 0.4, 9.85, 'upper'],
      ['Bedroom', '4.05 × 3.7 ≈ 15.0 m²', 2.3, H1 + 0.4, 12.7, 'upper'],
      ['Bedroom', '4.05 × 3.7 ≈ 15.0 m²', 6.5, H1 + 0.4, 12.7, 'upper'],
      ['Garden passage', '1.0–1.2 m', 9.2, H1 + 0.4, 13.2, 'upper', true],
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
    front: { cam: V(1.6, 3.2, -18), tgt: V(5.4, 3.9, 4), mode: 'all' },
    aerial: { cam: V(-11, 21, -12.5), tgt: V(5.2, 2.5, 8.5), mode: 'all' },
    rear: { cam: V(15, 6.5, 29), tgt: V(5.2, 3.4, 12), mode: 'all' },
    terrace: { cam: V(10.0, H1 + 1.6, 0.5), tgt: V(2.0, H1 + 1.2, 1.9), mode: 'all' },
    upper: { cam: V(5.2, 23, -1.5), tgt: V(5.2, H1, 6.6), mode: 'upper' },
    ground: { cam: V(5.2, 21, -1.5), tgt: V(5.2, 0, 6.4), mode: 'ground' },
    living: { cam: V(4.6, H1 + 1.55, 5.9), tgt: V(1.2, H1 + 1.05, 2.8), mode: 'all' },
    kitchen: { cam: V(4.6, H1 + 1.6, 2.7), tgt: V(8.6, H1 + 1.0, 5.6), mode: 'all' },
    bedroom: { cam: V(4.1, H1 + 1.6, 10.9), tgt: V(1.0, H1 + 0.9, 13.3), mode: 'all' },
    lobby: { cam: V(4.3, H1 + 1.6, 10.2), tgt: V(4.6, H1 + 1.1, 6.0), mode: 'all' },
    garage: { cam: V(5.9, 2.5, 0.45), tgt: V(8.5, 0.9, 7.0), mode: 'all' },
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
