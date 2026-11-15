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
  // Upstairs the stair enclosure sits 0.20 m nearer the street than the flights need, which
  // leaves 0.20 m (not 0.40 m) behind flight 2 and gives the living + kitchen 0.20 m more depth.
  const Z_GARAGE = 6.1; // upstairs: hall | stair wall
  const Z_STAIR0 = Z_GARAGE + 0.15; // upstairs: stair enclosure starts
  const Z_STAIR1 = Z_STAIR0 + 2.6; // upstairs: stair | kitchen wall
  const Z_HALL = Z_STAIR1 + 0.15; // kitchen starts
  const Z_FLIGHT = 9.05; // the flights, fixed by the ground floor: flight 2 ends 0.40 m before this
  const Z_GAR2 = 11.2; // ground: storage pallets run to here
  const X_GW = 4.77; // ground: storage | garage wall (garage 5.10 m clear at its rear wall)
  // L-stair, open to the garage: flight 1 along the right wall rising toward the garden,
  // a corner landing, then flight 2 turning left and arriving upstairs at XS.
  const TR = 0.27; // stair going
  const R = H1 / 18; // stair rise
  const XL = 8.8; // flight 1 and the corner landing run from here to the right wall
  const XS = XL - 8 * TR; // top of flight 2 (upstairs arrival)
  const F2 = [Z_FLIGHT - 1.5, Z_FLIGHT - 0.4] as const; // flight 2 and the corner landing, in z
  const Z_F1 = F2[0] - 8 * TR; // first riser of flight 1
  // Garage 5.10–5.56 × 8.50 m clear from the street to Z_SH: two cars side by side at the
  // front, free space behind them (wide enough to drive in between the WC and the stair), the
  // L-stair along the right wall and the storage WC in the rear-left corner.
  const X_WC = X_GW + 0.15; // storage shower room 1.35 × 2.00, door from the rear storage
  const Z_SH = 0.3 + 8.5; // garage | rear storage wall
  const Z_WC1 = Z_SH;
  const Z_WC0 = Z_WC1 - 2.0;
  const Z_REAR = D - 0.3; // inner face of the ground-floor rear wall
  // Upper floor, Revision 07: bedrooms on the street side, living + kitchen at the back onto
  // a 2.00 m back terrace. The stair (fixed by the ground floor) stays in the middle.
  const Z_FW = 0.3; // inner face of the upper front wall (flush with the street facade)
  const Z_BED = 4.3; // bedrooms | hall wall (bedrooms 4.00 m deep)
  const ZB = Z_BED + 0.15; // hall starts (hall 1.65 m deep up to the stair wall)
  const Z_EN0 = Z_BED; // master | en-suite: the master's back wall stays in line with bedroom 2's
  const Z_EN1 = Z_EN0 + 0.15 + 1.8; // en-suite | main bath wall (en-suite 2.85 × 1.80)
  // One straight front wall for living + kitchen, in line with the stair | kitchen wall; the
  // baths and the corridor run back to it.
  const Z_LD = Z_STAIR1; // baths / corridor | living wall, with the living door
  const Z_B1 = Z_LD; // main bath ends here (main bath 2.85 × 2.45)
  const Z_TER = 2.0; // back terrace depth
  const Z_RW1 = D - Z_TER; // outer face of the upper rear wall
  const Z_RW0 = Z_RW1 - 0.3; // inner face of the upper rear wall
  const X_BATH = 3.15; // baths | corridor wall: both baths 2.85 m wide
  const X_COR0 = X_BATH + 0.15; // corridor starts here
  const X_COR1 = 5.5; // corridor | stair wall, with the stair door
  const X_B2 = 4.77; // master | work room wall ends here (master 4.32 m wide)
  // work room | bedroom 2 wall ends here. Bedroom 2 is one open room, 3.0–3.2 × 5.80 (≈ 17.8 m²),
  // from the street back to the stair wall, with an open dressing area at the back.
  const X_SUITE = 7.25;
  const Z_WR = Z_FW + 3.2; // work room back wall (work room 2.33 × 3.20); the hall widens behind it
  // Service shaft for ventilation and cables (roof solar panels): 0.40 × 1.00 m outside, between
  // the en-suite and the main bath on the corridor side, venting both baths. It runs from the
  // upper floor to the roof; below the upper slab, only a duct and a cable tray continue, under
  // the storage ceiling, to the storage shower room and the garage panel.
  const SH_X: readonly [number, number] = [X_BATH - 1.0, X_BATH];
  const SH_Z: readonly [number, number] = [Z_EN1 + 0.15 - 0.4, Z_EN1 + 0.15];
  const SH_T = 0.05; // shaft lining thickness (0.30 × 0.90 clear)
  const shaftHole = rect(SH_X[0] + SH_T, SH_Z[0] + SH_T, SH_X[1] - SH_T, SH_Z[1] - SH_T);
  // Second, smaller shaft 0.40 × 0.50 m outside, upper floor only: from the roof down into the
  // corner of the stair enclosure beside the stair door landing.
  const SH2_X: readonly [number, number] = [X_COR1 + 0.1, X_COR1 + 0.6];
  const SH2_Z: readonly [number, number] = [Z_STAIR0, Z_STAIR0 + 0.4];
  const shaft2Hole = rect(SH2_X[0] + SH_T, SH2_Z[0] + SH_T, SH2_X[1] - SH_T, SH2_Z[1] - SH_T);
  /** A shaft's four walls between y0 and y1 (the bath shaft unless another is given). */
  function shaftWalls(
    y0: number,
    y1: number,
    grp: THREE.Object3D,
    sx: readonly [number, number] = SH_X,
    sz: readonly [number, number] = SH_Z,
  ) {
    box(sx[0], sx[1], y0, y1, sz[0], sz[0] + SH_T, M.wallIn, grp);
    box(sx[0], sx[1], y0, y1, sz[1] - SH_T, sz[1], M.wallIn, grp);
    box(sx[0], sx[0] + SH_T, y0, y1, sz[0] + SH_T, sz[1] - SH_T, M.wallIn, grp);
    box(sx[1] - SH_T, sx[1], y0, y1, sz[0] + SH_T, sz[1] - SH_T, M.wallIn, grp);
  }
  // Ground-floor garden door at the right of the rear wall, under the garden-stair landing.
  const GD: readonly [number, number] = [8.45, 9.35];
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
      [GD[0], GD[1], 0, 2.2],
    ],
    M.plasterBase,
    g,
  );
  const zg = Z_REAR + 0.15;
  glazeX(0.9, 3.3, zg, 2.0, 3.0, g, 2, 0.15);
  glazeX(4.6, 6.4, zg, 2.0, 3.0, g, 1, 0.15);
  // garden door: frame, solid leaf, handle and an outside step
  box(GD[0], GD[1], 2.15, 2.2, Z_REAR, D, M.alu, g);
  box(GD[0], GD[0] + 0.05, 0, 2.2, Z_REAR, D, M.alu, g);
  box(GD[1] - 0.05, GD[1], 0, 2.2, Z_REAR, D, M.alu, g);
  box(GD[0] + 0.05, GD[1] - 0.05, 0, 2.15, zg - 0.03, zg + 0.03, M.walnut, g);
  box(GD[1] - 0.17, GD[1] - 0.13, 0.95, 1.15, zg + 0.03, zg + 0.07, M.chrome, g);
  box(GD[0] - 0.1, GD[1] + 0.1, 0, 0.03, D, D + 0.4, M.coping, g);
  // Services below the shaft, no shaft here: a vent duct and a cable tray under the storage
  // ceiling. The duct jogs along the garage wall into the shower room; the tray goes through the
  // wall to the electrical panel / solar inverter on the garage side.
  {
    const yd0 = W1 - 0.32;
    const yd1 = W1 - 0.08;
    const xm = (SH_X[0] + SH_X[1]) / 2;
    const zd = SH_Z[0] + 0.08;
    box(xm - 0.12, X_GW - 0.05, yd0, yd1, zd, zd + 0.24, M.alu, g); // duct along x
    box(X_GW - 0.3, X_GW - 0.05, yd0, yd1, zd, Z_WC0 + 0.6, M.alu, g); // duct along z, by the wall
    box(X_GW - 0.05, X_WC + 0.1, yd0, yd1, Z_WC0 + 0.35, Z_WC0 + 0.6, M.alu, g); // into the shower room
    box(X_WC + 0.1, X_WC + 0.12, yd0 + 0.02, yd1 - 0.02, Z_WC0 + 0.37, Z_WC0 + 0.58, M.black, g); // grille
    const zt = zd - 0.3;
    box(xm, xm + 0.2, W1 - 0.06, W1 - 0.03, zt, SH_Z[0] + 0.15, M.rackBeam, g); // from the shaft
    box(xm, X_WC + 0.05, W1 - 0.06, W1 - 0.03, zt, zt + 0.2, M.rackBeam, g); // cable tray
    box(X_WC + 0.02, X_WC + 0.05, 1.8, W1 - 0.03, zt, zt + 0.2, M.rackBeam, g); // down the garage wall
    box(X_WC, X_WC + 0.2, 1.0, 1.8, zt - 0.25, zt + 0.45, M.white, g); // panel / inverter
  }
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
  // storage shower room 1.35 × 2.00 in the garage's rear-left corner, door in the rear wall
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
  // shower across the front, WC and basin behind it, by the door
  box(X_WC, X_WC + 1.35, 0, 0.03, Z_WC0, Z_WC0 + 0.9, M.white, gf, { cast: false }); // shower tray
  box(X_WC, X_WC + 0.85, 0, 2.0, Z_WC0 + 0.9, Z_WC0 + 0.92, M.glassRail, gf, { cast: false });
  cyl(X_WC + 0.67, 1.95, 2.0, Z_WC0 + 0.45, 0.12, M.chrome, gf, 16);
  box(X_WC + 0.7, X_WC + 1.35, 0, 0.42, Z_WC0 + 1.0, Z_WC0 + 1.45, M.white, gf); // WC
  box(X_WC + 1.2, X_WC + 1.35, 0.42, 0.8, Z_WC0 + 1.0, Z_WC0 + 1.45, M.white, gf);
  box(X_WC, X_WC + 0.4, 0.8, 0.95, Z_WC0 + 1.05, Z_WC0 + 1.45, M.white, gf); // basin

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
  slab(BLD, [stairHole, shaftHole], H1, SLAB, M.slab, G.slab);
  box(0, W_FRONT, W1 - 0.02, W1, 0, 0.02, M.coping, G.slab); // drip line
  // back terrace decking across the full width, over the rear storage
  slab(toRight(0.25, Z_RW1, D - 0.2, 0.25), [], H1 + 0.03, 0.03, M.deck, G.terrace).castShadow =
    false;
  // rear upstand + frameless glass railing, open where the provisional garden stair lands
  const GATE = [8.45, 9.65] as const;
  (
    [
      [0.25, GATE[0]],
      [GATE[1], XR(D) - 0.25],
    ] as const
  ).forEach(([a, b]) => {
    box(a, b, H1, H1 + 0.25, D - 0.2, D, M.plaster, G.terrace);
    box(a, b, H1 + 0.25, H1 + 0.27, D - 0.2, D, M.coping, G.terrace);
    box(a + 0.02, b - 0.02, H1 + 0.27, H1 + 1.1, D - 0.12, D - 0.1, M.glassRail, G.terrace, {
      cast: false,
    });
    box(a, b, H1 + 1.08, H1 + 1.12, D - 0.14, D - 0.08, M.alu, G.terrace);
  });
  box(GATE[0], GATE[1], H1, H1 + 0.03, D - 0.2, D, M.deck, G.terrace, { cast: false });
  // privacy walls on boundaries (no openings to neighbours)
  box(0, 0.25, H1, H1 + 1.8, Z_RW1, D, M.plaster, G.terrace);
  box(0, 0.25, H1 + 1.8, H1 + 1.84, Z_RW1, D, M.coping, G.terrace);
  rightWall(Z_RW1, D, H1, H1 + 1.8, 0.25, M.plaster, G.terrace);
  rightWall(Z_RW1, D, H1 + 1.8, H1 + 1.84, 0.25, M.coping, G.terrace);
  // terrace furniture
  {
    const t = G.terrace;
    const tf = H1 + 0.03;
    // dining in front of the living room, clear of the air-conditioner outdoor unit
    box(1.4, 3.0, tf + 0.72, tf + 0.76, D - 1.55, D - 0.65, M.oakFurn, t);
    box(1.45, 1.52, tf, tf + 0.72, D - 1.5, D - 0.7, M.oakFurn, t);
    box(2.88, 2.95, tf, tf + 0.72, D - 1.5, D - 0.7, M.oakFurn, t);
    (
      [
        [1.7, D - 0.45],
        [2.5, D - 0.45],
        [1.7, D - 1.75],
        [2.5, D - 1.75],
      ] as const
    ).forEach(([x, z]) => {
      box(x - 0.22, x + 0.22, tf + 0.42, tf + 0.46, z - 0.2, z + 0.2, M.alu, t);
      box(x - 0.22, x + 0.22, tf, tf + 0.42, z - 0.02, z + 0.02, M.alu, t);
    });
    // two lounge chairs and a side table in front of the kitchen, facing the garden
    [5.0, 6.6].forEach((x) => {
      box(x, x + 0.75, tf, tf + 0.32, D - 1.5, D - 0.45, M.oakFurn, t);
      box(x + 0.03, x + 0.72, tf + 0.32, tf + 0.42, D - 1.45, D - 0.5, M.linen, t);
      box(x + 0.03, x + 0.72, tf + 0.32, tf + 0.75, D - 1.45, D - 1.3, M.linen, t);
    });
    cyl(6.2, tf, tf + 0.45, D - 0.95, 0.2, M.oakFurn, t, 16);
    // planters
    (
      [
        [3.4, D - 0.6],
        [7.9, D - 0.6],
      ] as const
    ).forEach(([x, z]) => {
      box(x - 0.3, x + 0.3, tf, tf + 0.5, z - 0.3, z + 0.3, M.coping, t);
      foliage(0.42, M.leaf, x, tf + 0.85, z, t);
    });
  }

  // vertical steel ladder from the terrace to the roof, fixed to the rear wall at the right end
  // (past the kitchen window): rungs every 0.30 m, rails carried over the parapet and down to
  // the roof as handholds, and a step on the roof side
  {
    const LX: readonly [number, number] = [9.4, 9.8];
    const zr0 = Z_RW1 + 0.15; // rails stand 0.15–0.20 m off the wall
    const zr1 = zr0 + 0.05;
    const yTop = PARA + 0.9;
    const zBack = Z_RW1 - 0.55; // where the rails come down on the roof
    for (const x of LX) {
      box(x - 0.025, x + 0.025, H1 + 0.03, H2, zr0, zr1, M.steel, G.terrace);
      box(x - 0.025, x + 0.025, H2, yTop, zr0, zr1, M.steel, G.roof);
      box(x - 0.025, x + 0.025, yTop - 0.05, yTop, zBack, zr1, M.steel, G.roof);
      box(x - 0.025, x + 0.025, ROOF + 0.04, yTop, zBack, zBack + 0.05, M.steel, G.roof);
      for (let y = H1 + 1.0; y < PARA; y += 1.2)
        box(x - 0.02, x + 0.02, y, y + 0.04, Z_RW1, zr0, M.steel, y < H2 ? G.terrace : G.roof);
    }
    for (let y = H1 + 0.3; y < PARA + 0.05; y += 0.3)
      box(LX[0], LX[1], y, y + 0.03, zr0 + 0.01, zr1 - 0.01, M.steel, y < H2 ? G.terrace : G.roof);
    box(
      LX[0] - 0.05,
      LX[1] + 0.05,
      ROOF + 0.04,
      ROOF + 0.3,
      zBack - 0.1,
      Z_RW1 - 0.2,
      M.steel,
      G.roof,
    );
  }

  /* ================= UPPER FLOOR ================= */
  // Street side: master bedroom with its en-suite, bedroom 2, and a work room that runs back to
  // the stair wall. Middle: hall, main bath, a corridor, and the stair behind its own door.
  // Garden side: living + kitchen across the full width, onto the back terrace.
  const u = G.upper;
  const fl = H1;
  const ZM = Z_STAIR1; // stair | kitchen wall
  /** Box whose z range is mirrored about the building depth (Revision 06 furniture, flipped). */
  const mbox = (
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    mat: THREE.Material,
    grp: THREE.Object3D,
    o?: { cast?: boolean; recv?: boolean },
  ) => box(x0, x1, y0, y1, D - z1, D - z0, mat, grp, o);
  // interior floors
  box(0.3, X_SUITE, fl, fl + 0.02, Z_FW, ZB, M.oak, u, { cast: false }); // bedrooms
  box(X_COR0, X_SUITE, fl, fl + 0.02, ZB, Z_GARAGE, M.oak, u, { cast: false }); // hall
  slab(toRight(X_SUITE, Z_FW, Z_GARAGE, 0.3), [], fl + 0.02, 0.02, M.oak, u).castShadow = false; // bedroom 2 + wardrobe
  box(X_COR0, XS, fl, fl + 0.02, Z_GARAGE, ZM, M.oak, u, { cast: false }); // corridor + stair landing
  box(XS, XL, fl, fl + 0.02, Z_STAIR0, F2[0], M.oak, u, { cast: false }); // landing beside flight 1
  box(XS, XR(ZM) - 0.3, fl, fl + 0.02, F2[1], ZM, M.oak, u, { cast: false }); // strip behind flight 2
  slab(toRight(0.3, ZM, Z_RW0, 0.3), [], fl + 0.02, 0.02, M.oak, u).castShadow = false; // living + kitchen
  box(0.3, X_BATH, fl, fl + 0.03, Z_EN0 + 0.15, Z_B1, M.tile, u, { cast: false }); // both baths
  // side walls (blind)
  box(0, 0.3, fl, H2, 0, Z_RW1, M.plaster, u);
  rightWall(0, Z_RW1, fl, H2, 0.3, M.plaster, u);
  // street wall: two bedroom windows and the work-room window
  const streetOps: Opening[] = [
    [1.0, 3.9, fl + 0.9, fl + 2.35],
    [5.2, 6.75, fl + 0.9, fl + 2.35],
    [7.75, 9.95, fl + 0.9, fl + 2.35],
  ];
  wallX(0, W_FRONT, 0, Z_FW, fl, H2, streetOps, M.plaster, u);
  streetOps.forEach(([a, b, s, h]) => {
    glazeX(a, b, 0.15, s, h, u, b - a > 1.5 ? 2 : 1, 0);
    box(a - 0.05, b + 0.05, s - 0.05, s, 0.13, 0.35, M.coping, u); // inner sill
  });
  // wood cladding on the street facade above the garage
  wallX(4.4, XR(-0.05), -0.05, 0, fl, H2, streetOps.slice(1), M.clad, u);
  // rear wall onto the terrace. Living: a solid stretch for the air conditioner, a window and a
  // glazed door to the terrace. Kitchen: one window, 0.25 m in from the right party wall.
  const LIV_WIN: readonly [number, number] = [1.6, 3.7];
  const TER_DOOR: readonly [number, number] = [4.0, 4.9];
  const KIT_WIN: readonly [number, number] = [6.0, 9.35];
  const SILL = fl + 0.4; // both windows start 0.40 m above the floor
  const rearOps: Opening[] = [
    [LIV_WIN[0], LIV_WIN[1], SILL, fl + 2.45],
    [TER_DOOR[0], TER_DOOR[1], fl, fl + 2.3],
    [KIT_WIN[0], KIT_WIN[1], SILL, fl + 2.45],
  ];
  wallX(0, XR(Z_RW0), Z_RW0, Z_RW1, fl, H2, rearOps, M.plaster, u);
  const zr = Z_RW0 + 0.15;
  [LIV_WIN, KIT_WIN].forEach(([a, b]) => {
    glazeX(a, b, zr, SILL, fl + 2.45, u, b - a > 3 ? 3 : 2, 0);
    box(a - 0.05, b + 0.05, SILL - 0.05, SILL, Z_RW0 - 0.2, Z_RW0, M.coping, u); // inner sill
    box(a - 0.05, b + 0.05, SILL - 0.05, SILL, Z_RW1, Z_RW1 + 0.06, M.coping, u); // outer sill
  });
  glazeX(TER_DOOR[0], TER_DOOR[1], zr, fl, fl + 2.3, u, 1, 0);
  box(TER_DOOR[0] + 0.07, TER_DOOR[0] + 0.1, fl + 1.0, fl + 1.2, zr - 0.08, zr - 0.04, M.chrome, u); // handle
  box(TER_DOOR[0] - 0.05, TER_DOOR[1] + 0.05, fl, fl + 0.03, Z_RW0, Z_RW1, M.coping, u); // threshold
  // master | hall, with the master door
  wallX(X_COR0, X_B2, Z_BED, ZB, fl, H2, [[3.45, 4.25, fl, fl + 2.1]], M.wallIn, u);
  casingX(3.45, 4.25, Z_BED, ZB, fl + 2.1, u);
  box(X_B2 - 0.15, X_B2, fl, H2, Z_FW, Z_BED, M.wallIn, u); // master | work room
  // work room | hall: the work room is 3.20 m deep and the hall widens behind it
  wallX(X_B2, X_SUITE - 0.15, Z_WR, Z_WR + 0.15, fl, H2, [[4.95, 5.75, fl, fl + 2.1]], M.wallIn, u);
  casingX(4.95, 5.75, Z_WR, Z_WR + 0.15, fl + 2.1, u);
  // work room / hall | bedroom 2, running back to the stair wall, with the bedroom door just
  // behind the work room, so the door opens into the bedroom, not the dressing area
  const ZBD2 = Z_WR + 0.2; // bedroom 2 door
  wallZ(
    Z_FW,
    Z_GARAGE,
    X_SUITE - 0.15,
    X_SUITE,
    fl,
    H2,
    [[ZBD2, ZBD2 + 0.8, fl, fl + 2.1]],
    M.wallIn,
    u,
  );
  casingZ(ZBD2, ZBD2 + 0.8, X_SUITE - 0.17, X_SUITE + 0.02, fl + 2.1, u);
  // master | en-suite, with the en-suite door
  wallX(0.3, X_BATH, Z_EN0, Z_EN0 + 0.15, fl, H2, [[1.5, 2.25, fl, fl + 2.1]], M.wallIn, u);
  casingX(1.5, 2.25, Z_EN0, Z_EN0 + 0.15, fl + 2.1, u);
  box(0.3, X_BATH, fl, H2, Z_EN1, Z_EN1 + 0.15, M.wallIn, u); // en-suite | main bath
  // baths | master entry and corridor, with the main bath door; it runs on to the living wall
  const ZBD = Z_EN1 + 0.3; // main bath door
  wallZ(Z_EN0, Z_LD, X_BATH, X_COR0, fl, H2, [[ZBD, ZBD + 0.8, fl, fl + 2.1]], M.wallIn, u);
  casingZ(ZBD, ZBD + 0.8, X_BATH - 0.02, X_COR0 + 0.02, fl + 2.1, u);
  // corridor | living, with the living door just past the stair door
  wallX(0.3, X_COR1 + 0.1, Z_LD, Z_LD + 0.15, fl, H2, [[3.7, 5.1, fl, fl + 2.1]], M.wallIn, u);
  casingX(3.7, 5.1, Z_LD, Z_LD + 0.15, fl + 2.1, u);
  // hall | stair (the stair sits behind it, so it stays put)
  box(X_COR1, XR(Z_GARAGE) - 0.15, fl, H2, Z_GARAGE, Z_STAIR0, M.wallIn, u);
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
  box(X_COR1, XR(Z_STAIR1) - 0.15, fl, H2, Z_STAIR1, Z_HALL, M.wallIn, u); // stair | kitchen
  // living | kitchen, in line with the corridor | stair wall, with the kitchen door near the front
  const ZKD = Z_HALL + 0.1; // kitchen door
  wallZ(Z_HALL, Z_RW0, X_COR1, X_COR1 + 0.1, fl, H2, [[ZKD, ZKD + 0.9, fl, fl + 2.1]], M.wallIn, u);
  casingZ(ZKD, ZKD + 0.9, X_COR1 - 0.02, X_COR1 + 0.12, fl + 2.1, u);
  // guards around the stair opening
  box(XS, XL, fl, fl + 1.0, F2[0] - 0.015, F2[0] + 0.015, M.glassRail, u, { cast: false });
  box(XS, XL, fl + 0.97, fl + 1.0, F2[0] - 0.03, F2[0] + 0.03, M.oakFurn, u);
  box(XL - 0.015, XL + 0.015, fl, fl + 1.0, Z_STAIR0, F2[0], M.glassRail, u, { cast: false });
  box(XL - 0.03, XL + 0.03, fl + 0.97, fl + 1.0, Z_STAIR0, F2[0], M.oakFurn, u);
  box(XS, XR(F2[1]) - 0.3, fl, fl + 1.0, F2[1] - 0.015, F2[1] + 0.015, M.glassRail, u, {
    cast: false,
  });
  box(XS, XR(F2[1]) - 0.3, fl + 0.97, fl + 1.0, F2[1] - 0.03, F2[1] + 0.03, M.oakFurn, u);

  // service shaft between the baths: vent grilles into both, access panel from the corridor
  shaftWalls(fl, H2, u);
  box(SH_X[0] + 0.25, SH_X[1] - 0.25, H2 - 0.6, H2 - 0.4, SH_Z[0] - 0.02, SH_Z[0], M.black, u);
  box(SH_X[0] + 0.25, SH_X[1] - 0.25, H2 - 0.6, H2 - 0.4, SH_Z[1], SH_Z[1] + 0.02, M.black, u);
  box(X_COR0, X_COR0 + 0.02, fl + 0.3, fl + 1.9, SH_Z[0] + 0.05, SH_Z[1] - 0.05, M.steel, u);
  // small stair shaft, upper floor only, access panel facing the landing
  shaftWalls(fl, H2, u, SH2_X, SH2_Z);
  box(SH2_X[0] + 0.1, SH2_X[1] - 0.1, fl + 0.3, fl + 1.9, SH2_Z[1], SH2_Z[1] + 0.02, M.steel, u);

  /* upper furniture */
  const f = G.upperFurn;
  const F = fl + 0.02;
  // living (5.2 × 3.4): media unit on the party wall, sofa facing it, clear of the door
  const ZL = Z_LD + 0.15; // living starts
  box(0.9, 3.4, F, F + 0.01, ZL + 0.3, ZL + 2.9, M.rug, f, { cast: false });
  box(2.6, 3.5, F, F + 0.42, ZL + 0.4, ZL + 2.8, M.sofa, f); // sofa
  box(3.25, 3.5, F + 0.42, F + 0.85, ZL + 0.4, ZL + 2.8, M.sofa, f);
  box(2.6, 3.25, F + 0.42, F + 0.62, ZL + 0.4, ZL + 0.6, M.sofa, f);
  box(2.6, 3.25, F + 0.42, F + 0.62, ZL + 2.6, ZL + 2.8, M.sofa, f);
  box(2.63, 3.23, F + 0.42, F + 0.52, ZL + 0.62, ZL + 1.58, M.linen, f);
  box(2.63, 3.23, F + 0.42, F + 0.52, ZL + 1.62, ZL + 2.58, M.linen, f);
  box(3.0, 3.22, F + 0.5, F + 0.82, ZL + 0.8, ZL + 1.2, M.clay, f);
  box(3.0, 3.22, F + 0.5, F + 0.82, ZL + 2.0, ZL + 2.4, M.olive, f);
  box(1.35, 2.05, F, F + 0.36, ZL + 0.95, ZL + 2.25, M.walnut, f); // coffee table
  cyl(1.7, F + 0.36, F + 0.5, ZL + 1.6, 0.09, M.clay, f, 14, 0.06);
  box(0.3, 0.7, F, F + 0.5, ZL + 0.6, ZL + 2.6, M.walnut, f); // media unit on the party wall
  box(0.3, 0.34, F + 0.9, F + 1.65, ZL + 0.95, ZL + 2.25, M.black, f);
  cyl(0.6, F, F + 1.55, ZL + 0.3, 0.015, M.black, f, 8);
  cyl(0.6, F + 1.45, F + 1.7, ZL + 0.3, 0.14, M.lampOn, f, 16, 0.18);
  cyl(0.65, F, F + 0.45, Z_RW0 - 0.4, 0.17, M.pot, f, 14);
  foliage(0.42, M.leaf, 0.65, F + 1.0, Z_RW0 - 0.4, f);
  // air conditioner: indoor unit high on the solid stretch of the rear wall, outdoor unit on
  // the terrace behind it
  box(0.45, 1.4, F + 2.25, F + 2.55, Z_RW0 - 0.22, Z_RW0, M.white, f);
  box(0.5, 1.35, F + 2.27, F + 2.3, Z_RW0 - 0.225, Z_RW0 - 0.22, M.black, f);
  box(0.35, 1.15, F + 0.03, F + 0.63, Z_RW1 + 0.05, Z_RW1 + 0.35, M.white, f);
  cyl(0.75, F + 0.32, F + 0.34, Z_RW1 + 0.36, 0.2, M.black, f, 20).rotation.x = Math.PI / 2;
  // kitchen along the stair-side wall, dining table between it and the terrace
  const ZK0 = Z_HALL; // kitchen run starts at the stair wall
  const ZK = ZK0 + 0.6;
  const XK0 = 6.55; // kitchen run starts clear of the kitchen door
  box(XK0, 8.9, F, F + 0.86, ZK0, ZK, M.oakFurn, f);
  box(XK0, 8.9, F + 0.86, F + 0.9, ZK0, ZK, M.counter, f);
  box(XK0, 8.9, F + 0.9, F + 1.5, ZK0, ZK0 + 0.02, M.terracotta, f);
  box(XK0, 8.9, F + 1.5, F + 2.25, ZK0, ZK0 + 0.35, M.oakFurn, f);
  box(8.9, XR(ZK) - 0.35, F, F + 2.25, ZK0, ZK + 0.05, M.white, f); // tall fridge unit
  box(7.8, 8.4, F + 0.9, F + 0.92, ZK - 0.52, ZK - 0.08, M.black, f); // hob
  box(7.0, 7.2, F + 0.9, F + 0.96, ZK0 + 0.1, ZK0 + 0.25, M.chrome, f); // tap/sink
  // table set along the depth so the run along the stair wall keeps its clearance
  const DX = 7.0;
  const DZ0 = 10.5;
  const DZ1 = DZ0 + 1.4;
  box(DX, DX + 0.9, F + 0.73, F + 0.77, DZ0, DZ1, M.oakFurn, f);
  box(DX + 0.4, DX + 0.5, F, F + 0.73, DZ0 + 0.15, DZ1 - 0.15, M.walnut, f);
  (
    [
      [DX - 0.2, DZ0 + 0.35, -1],
      [DX - 0.2, DZ1 - 0.35, -1],
      [DX + 1.1, DZ0 + 0.35, 1],
      [DX + 1.1, DZ1 - 0.35, 1],
    ] as const
  ).forEach(([x, z, side]) => {
    box(x - 0.21, x + 0.21, F + 0.44, F + 0.48, z - 0.2, z + 0.2, M.walnut, f);
    for (const dx of [-0.18, 0.18])
      for (const dz of [-0.17, 0.17])
        box(x + dx - 0.02, x + dx + 0.02, F, F + 0.44, z + dz - 0.02, z + dz + 0.02, M.walnut, f);
    const back = side < 0 ? x - 0.22 : x + 0.18;
    box(back, back + 0.04, F + 0.48, F + 0.86, z - 0.2, z + 0.2, M.walnut, f);
  });
  cyl(DX + 0.45, H2 - 0.9, H2, (DZ0 + DZ1) / 2, 0.004, M.black, f, 4);
  cyl(DX + 0.45, H2 - 1.12, H2 - 0.9, (DZ0 + DZ1) / 2, 0.04, M.lampOn, f, 20, 0.22);
  // en-suite (2.85 × 1.80): walk-in shower, WC, vanity
  const E0 = Z_EN0 + 0.15;
  box(0.3, 1.3, F, F + 0.03, Z_EN1 - 0.95, Z_EN1, M.white, f, { cast: false }); // shower tray
  box(1.3, 1.32, F, F + 2.0, Z_EN1 - 0.95, Z_EN1 - 0.25, M.glassRail, f, { cast: false });
  cyl(0.8, F + 1.9, F + 1.95, Z_EN1 - 0.45, 0.12, M.chrome, f, 16);
  box(0.3, 0.9, F, F + 0.42, E0 + 0.25, E0 + 0.7, M.white, f); // WC
  box(0.3, 0.45, F + 0.42, F + 0.8, E0 + 0.25, E0 + 0.7, M.white, f);
  box(X_BATH - 0.5, X_BATH, F + 0.5, F + 0.85, E0 + 0.45, E0 + 1.4, M.oakFurn, f); // vanity
  box(X_BATH - 0.45, X_BATH - 0.05, F + 0.85, F + 0.9, E0 + 0.68, E0 + 1.18, M.white, f);
  box(X_BATH - 0.02, X_BATH, F + 1.1, F + 1.9, E0 + 0.45, E0 + 1.4, M.chrome, f); // mirror
  // main bath (2.85 × 2.45): tub with shower, vanity, WC, washing machine
  const B0 = Z_EN1 + 0.15;
  box(0.3, 2.0, F, F + 0.55, Z_B1 - 0.75, Z_B1, M.white, f); // bathtub
  box(0.4, 1.9, F + 0.5, F + 0.56, Z_B1 - 0.67, Z_B1 - 0.08, M.glass, f, { cast: false });
  box(1.2, 2.0, F + 0.55, F + 2.0, Z_B1 - 0.77, Z_B1 - 0.75, M.glassRail, f, { cast: false });
  cyl(1.6, F + 1.9, F + 1.95, Z_B1 - 0.4, 0.12, M.chrome, f, 16);
  box(1.05, 2.2, F + 0.5, F + 0.85, B0, B0 + 0.5, M.oakFurn, f); // vanity, clear of the door
  box(1.25, 2.0, F + 0.85, F + 0.9, B0 + 0.05, B0 + 0.45, M.white, f);
  box(1.05, 2.2, F + 1.1, F + 1.9, B0, B0 + 0.02, M.chrome, f); // mirror
  box(0.3, 0.9, F, F + 0.42, B0 + 0.4, B0 + 0.85, M.white, f); // WC
  box(0.3, 0.45, F + 0.42, F + 0.8, B0 + 0.4, B0 + 0.85, M.white, f);
  box(2.45, 3.1, F, F + 0.85, Z_B1 - 0.6, Z_B1, M.white, f); // washing machine
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 24), M.black);
  drum.rotation.x = Math.PI / 2;
  drum.position.set(2.775, F + 0.45, -(Z_B1 - 0.61));
  f.add(drum);
  box(2.45, 3.1, F + 0.85, F + 0.88, Z_B1 - 0.6, Z_B1, M.counter, f);
  // corridor: ceiling light
  cyl((X_COR0 + X_COR1) / 2, H2 - 0.06, H2, 7.0, 0.18, M.lampOn, f, 24);
  // stair landing: shoe cabinet beside flight 1
  box(XS + 0.2, XL - 0.2, F, F + 0.9, Z_STAIR0, Z_STAIR0 + 0.4, M.oakFurn, f);
  // work room (2.33 × 3.20): desk under the street window, shelving on the master wall, sofa on
  // the bedroom wall
  {
    const xw0 = X_B2;
    const xw1 = X_SUITE - 0.15;
    const zD0 = Z_FW + 0.05;
    const zD1 = zD0 + 0.7;
    box(xw0 + 0.3, xw1 - 0.3, F + 0.73, F + 0.77, zD0, zD1, M.oakFurn, f); // desk
    box(xw0 + 0.32, xw0 + 0.38, F, F + 0.73, zD0 + 0.05, zD1 - 0.05, M.oakFurn, f);
    box(xw1 - 0.38, xw1 - 0.32, F, F + 0.73, zD0 + 0.05, zD1 - 0.05, M.oakFurn, f);
    box(5.6, 6.2, F + 0.77, F + 1.15, zD0 + 0.05, zD0 + 0.08, M.black, f); // monitor
    box(6.45, 6.5, F + 0.77, F + 1.2, zD0 + 0.15, zD0 + 0.2, M.black, f); // task lamp
    cyl(6.45, F + 1.15, F + 1.25, zD0 + 0.3, 0.07, M.lampOn, f, 12, 0.03);
    box(5.68, 6.12, F + 0.44, F + 0.48, zD1 + 0.25, zD1 + 0.7, M.walnut, f); // chair
    box(5.88, 5.93, F, F + 0.44, zD1 + 0.45, zD1 + 0.5, M.steel, f);
    box(5.68, 6.12, F + 0.48, F + 0.95, zD1 + 0.66, zD1 + 0.7, M.walnut, f);
    box(xw0, xw0 + 0.35, F, F + 2.0, zD1 + 0.3, Z_WR - 0.9, M.oakFurn, f); // shelving, clear of the door
    for (let y = F + 0.4; y < F + 2.0; y += 0.4)
      box(xw0 + 0.35, xw0 + 0.36, y, y + 0.02, zD1 + 0.3, Z_WR - 0.9, M.walnut, f);
    box(xw1 - 0.8, xw1, F, F + 0.42, 1.5, 3.4, M.sofa, f); // sofa
    box(xw1 - 0.2, xw1, F + 0.42, F + 0.85, 1.5, 3.4, M.sofa, f);
    box(xw1 - 0.75, xw1 - 0.2, F + 0.42, F + 0.52, 1.55, 3.35, M.linen, f);
    box(5.3, xw1 - 0.9, F, F + 0.01, 1.5, 3.3, M.rug, f, { cast: false });
  }
  // master (4.32 × 4.00): bed on the party wall, wardrobe on the bedroom 2 wall, en-suite door
  // in the back wall
  box(X_B2 - 0.75, X_B2 - 0.15, F, H2 - 0.05, 0.8, 3.3, M.oakFurn, f);
  for (let z = 1.3; z < 3.3; z += 0.5)
    box(X_B2 - 0.76, X_B2 - 0.75, F + 0.05, H2 - 0.08, z - 0.005, z + 0.005, M.walnut, f);
  box(0.3, 0.38, F, F + 1.15, 1.05, 2.85, M.sofa, f); // headboard
  box(0.38, 2.4, F, F + 0.32, 1.1, 2.8, M.walnut, f);
  box(0.4, 2.38, F + 0.32, F + 0.55, 1.15, 2.75, M.white, f);
  box(0.95, 2.4, F + 0.55, F + 0.6, 1.13, 2.77, M.linen, f);
  box(1.9, 2.42, F + 0.56, F + 0.64, 1.12, 2.78, M.clay, f);
  box(0.45, 0.85, F + 0.55, F + 0.72, 1.25, 1.85, M.white, f);
  box(0.45, 0.85, F + 0.55, F + 0.72, 2.05, 2.6, M.white, f);
  [0.55, 2.9].forEach((z) => {
    box(0.3, 0.75, F, F + 0.5, z, z + 0.45, M.walnut, f);
    cyl(0.52, F + 0.5, F + 0.75, z + 0.22, 0.09, M.lampOn, f, 14, 0.12);
  });
  box(1.0, 3.3, F, F + 0.01, 0.8, 3.1, M.rug, f, { cast: false });
  // bedroom 2, one open room: bed with its head on the right party wall at the street end, an
  // open dressing area at the back (clothes rails and shelves, no doors), no wall between them
  {
    const xh = XR(2.1) - 0.3; // inner face of the party wall at the bed
    const bz0 = 1.3;
    const bz1 = 2.9;
    box(xh - 0.08, xh, F, F + 1.15, bz0 - 0.05, bz1 + 0.05, M.sofa, f); // headboard
    box(xh - 2.08, xh - 0.08, F, F + 0.32, bz0, bz1, M.walnut, f);
    box(xh - 2.05, xh - 0.1, F + 0.32, F + 0.55, bz0 + 0.02, bz1 - 0.02, M.white, f);
    box(xh - 2.08, xh - 0.65, F + 0.55, F + 0.6, bz0, bz1, M.olive, f);
    box(xh - 0.55, xh - 0.15, F + 0.55, F + 0.72, bz0 + 0.1, bz0 + 0.7, M.white, f);
    box(xh - 0.55, xh - 0.15, F + 0.55, F + 0.72, bz1 - 0.7, bz1 - 0.1, M.white, f);
    [bz0 - 0.5, bz1 + 0.05].forEach((z) => {
      box(XR(z) - 0.75, XR(z) - 0.32, F, F + 0.5, z, z + 0.45, M.walnut, f);
      cyl(XR(z) - 0.53, F + 0.5, F + 0.75, z + 0.22, 0.09, M.lampOn, f, 14, 0.12);
    });
    box(7.8, xh - 0.6, F, F + 0.01, 1.0, 3.2, M.rug, f, { cast: false });
    // open dressing area: a clothes rail and shelves along the stair wall, shelves on the party wall
    const xr = XR(Z_GARAGE) - 0.3;
    const zr = Z_GARAGE - 0.6;
    box(X_SUITE + 0.1, xr - 0.1, F, F + 0.04, zr, Z_GARAGE, M.oakFurn, f); // plinth
    box(X_SUITE + 0.1, xr - 0.1, F + 2.0, F + 2.04, zr, Z_GARAGE, M.oakFurn, f); // top shelf
    for (let x = X_SUITE + 0.1; x < xr; x += (xr - X_SUITE - 0.24) / 3)
      box(x, x + 0.04, F, F + 2.04, zr, Z_GARAGE, M.oakFurn, f); // uprights
    cyl((X_SUITE + xr) / 2, F + 1.75, F + 1.77, Z_GARAGE - 0.3, 0.015, M.chrome, f, 6);
    box(X_SUITE + 0.2, xr - 0.2, F + 1.74, F + 1.76, Z_GARAGE - 0.31, Z_GARAGE - 0.29, M.chrome, f); // rail
    const cloth = [M.linen, M.clay, M.olive, M.sofa, M.white];
    for (let i = 0, x = X_SUITE + 0.25; x < xr - 0.3; i++, x += 0.12)
      box(x, x + 0.06, F + 0.9, F + 1.72, Z_GARAGE - 0.5, Z_GARAGE - 0.1, cloth[i % 5], f);
    box(xr - 0.4, xr, F, F + 1.8, ZB + 0.1, zr - 0.2, M.oakFurn, f); // open shelves on the party wall
    for (let y = F + 0.4; y < F + 1.8; y += 0.4)
      box(xr - 0.4, xr, y, y + 0.02, ZB + 0.1, zr - 0.2, M.walnut, f);
  }

  /* ================= ROOF ================= */
  const roofPoly = toRight(0, 0, Z_RW1, 0);
  const skys = [
    rect(7.2, Z_STAIR0 + 0.4, 9.0, Z_STAIR1 - 0.4), // stair
    rect(X_COR0 + 0.45, 7.3, X_COR1 - 0.45, 8.4), // corridor, past its ceiling light
  ];
  slab(roofPoly, [...skys, shaftHole, shaft2Hole], ROOF, ROOF - H2, M.slab, G.roof);
  // both shafts on the roof: upstand, louvres and a cap; cables to the solar panels leave here
  (
    [
      [SH_X, SH_Z],
      [SH2_X, SH2_Z],
    ] as const
  ).forEach(([sx, sz]) => {
    shaftWalls(ROOF, ROOF + 0.7, G.roof, sx, sz);
    box(
      sx[0] - 0.01,
      sx[1] + 0.01,
      ROOF + 0.45,
      ROOF + 0.65,
      sz[0] - 0.01,
      sz[1] + 0.01,
      M.black,
      G.roof,
    );
    box(
      sx[0] - 0.05,
      sx[1] + 0.05,
      ROOF + 0.7,
      ROOF + 0.76,
      sz[0] - 0.05,
      sz[1] + 0.05,
      M.coping,
      G.roof,
    );
  });
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
    [0, XR(0) - 0.1, 0, pt],
    [0, XR(Z_RW1) - 0.1, Z_RW1 - pt, Z_RW1],
    [0, pt, 0, Z_RW1],
  ];
  parapets.forEach(([a, b, c, d]) => {
    box(a, b, ROOF, PARA, c, d, pm, G.roof);
    box(a - 0.02, b + 0.02, PARA, PARA + 0.05, c - 0.02, d + 0.02, M.coping, G.roof);
  });
  rightWall(0, Z_RW1, ROOF, PARA, pt, pm, G.roof);
  rightWall(0, Z_RW1, PARA, PARA + 0.05, pt, M.coping, G.roof, 0.02);
  // wood cladding continues up the slab edge and parapet above the garage
  box(4.4, XR(-0.05), H2, PARA, -0.05, 0, M.clad, G.roof);
  // roof plant + gravel
  slab(
    toRight(0.2, 0.2, Z_RW1 - 0.2, 0.2),
    [
      ...skys,
      rect(SH_X[0], SH_Z[0], SH_X[1], SH_Z[1]),
      rect(SH2_X[0], SH2_Z[0], SH2_X[1], SH2_Z[1]),
    ],
    ROOF + 0.04,
    0.04,
    M.concrete,
    G.roof,
  ).castShadow = false;
  box(4.0, 5.2, ROOF, ROOF + 0.7, 10.6, 11.6, M.chrome, G.roof);
  box(1.0, 2.2, ROOF, ROOF + 0.35, 11.5, 12.2, M.white, G.roof);
  // solar panels (for demonstration): two rows of nine 1.0 × 1.7 m panels on the street half of
  // the roof, tilted 15° toward the street, clear of the roof lights and the shaft cap. Their
  // cables go down the service shaft.
  {
    const pvTex = tex(256, (g2, sz) => {
      g2.fillStyle = '#1c2a44';
      g2.fillRect(0, 0, sz, sz);
      g2.strokeStyle = 'rgba(190,205,225,0.35)';
      g2.lineWidth = 2;
      for (let i = 1; i < 6; i++) {
        g2.beginPath();
        g2.moveTo((i * sz) / 6, 0);
        g2.lineTo((i * sz) / 6, sz);
        g2.stroke();
      }
      for (let j = 1; j < 10; j++) {
        g2.beginPath();
        g2.moveTo(0, (j * sz) / 10);
        g2.lineTo(sz, (j * sz) / 10);
        g2.stroke();
      }
    });
    const pvMat = new THREE.MeshStandardMaterial({
      map: pvTex,
      roughness: 0.25,
      metalness: 0.35,
    });
    const PW = 1.0;
    const PD = 1.7;
    const tilt = (15 * Math.PI) / 180;
    const y0 = ROOF + 0.3; // lower (street-side) edge
    [1.6, 3.9].forEach((zc) => {
      for (let k = 0; k < 9; k++) {
        const xc = 0.6 + PW / 2 + k * (PW + 0.02);
        const panel = new THREE.Mesh(new THREE.BoxGeometry(PW, 0.04, PD), [
          M.alu,
          M.alu,
          pvMat,
          M.alu,
          M.alu,
          M.alu,
        ]);
        panel.rotation.x = tilt;
        panel.position.set(xc, y0 + (PD / 2) * Math.sin(tilt), -zc);
        panel.castShadow = true;
        G.roof.add(panel);
      }
      const zf = zc - (PD / 2) * Math.cos(tilt);
      const zb = zc + (PD / 2) * Math.cos(tilt);
      const xEnd = 0.6 + 9 * (PW + 0.02);
      for (let x = 0.65; x < xEnd; x += 2.04) {
        box(x, x + 0.05, ROOF, y0, zf - 0.03, zf + 0.03, M.steel, G.roof); // front legs
        box(x, x + 0.05, ROOF, y0 + PD * Math.sin(tilt), zb - 0.03, zb + 0.03, M.steel, G.roof);
      }
      box(0.6, xEnd, ROOF + 0.04, ROOF + 0.08, zf - 0.03, zf + 0.03, M.steel, G.roof); // rails
      box(0.6, xEnd, ROOF + 0.04, ROOF + 0.08, zb - 0.03, zb + 0.03, M.steel, G.roof);
    });
  }

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
    box(9.77, 9.85, 0, fl - 0.12, D + 1.1, D + 1.18, M.steel, r); // post, clear of the garden door
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
  pl(2.1, H2 - 0.3, 10.3, 0.9);
  pl(7.9, H2 - 0.3, 10.8, 0.8);
  pl(4.3, H2 - 0.3, 7.0, 0.6);
  pl(2.25, H2 - 0.3, 2.2, 0.6);
  pl(6.1, H2 - 0.3, 2.2, 0.6);
  pl(1.7, H2 - 0.3, 5.35, 0.5);
  pl(1.7, H2 - 0.3, 7.6, 0.5);
  pl(5.5, H2 - 0.3, 5.5, 0.5);
  pl(9.2, H2 - 0.3, 2.2, 0.5);
  pl(9.2, H2 - 0.3, 4.8, 0.5);
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
      ['Shower room', '1.35 × 2.0, WC + shower, door from rear storage', 5.6, 1.2, 7.9, 'ground'],
      ['Free space', '2.4 m wide between WC and stair', 7.6, 1.2, 6.8, 'ground'],
      ['Duct + cable tray', 'under the ceiling, from the shaft', 3.4, 2.7, 6.0, 'ground'],
      ['Panel / inverter', 'solar cables end here', 5.2, 1.4, 5.6, 'ground'],
      ['Garden door', 'from the rear storage', 8.9, 1.2, 14.0, 'ground'],
      ['Private garage', '5.1 × 8.5, 2 cars side by side', 7.5, 1.9, 2.6, 'ground'],
      ['L-stair', '1.1–1.4 wide, turns left', 9.3, 2.2, 6.5, 'ground'],
      ['Back terrace', '10.1 → 10.0 × 2.0', 4.6, H1 + 0.4, 13.7, 'upper'],
      ['Roof ladder', 'from the terrace', 9.6, H1 + 0.4, 13.1, 'upper'],
      ['Living', '5.2 × 3.4', 2.0, H1 + 0.4, 11.0, 'upper'],
      ['Kitchen / dining', '4.25–4.4 × 3.4, own door', 8.6, H1 + 0.4, 11.6, 'upper'],
      ['Stair door', 'stair closed off', 6.1, H1 + 0.4, 8.5, 'upper'],
      ['Service shaft', '0.4 × 1.0, vents both baths', 2.65, H1 + 0.4, 6.2, 'upper'],
      ['Stair shaft', '0.4 × 0.5, roof → upper floor', 5.85, H1 + 0.4, 6.45, 'upper'],
      ['Corridor', '2.20 m wide', 4.3, H1 + 0.4, 7.3, 'upper'],
      ['Bath', '2.85 × 2.45, tub + shower', 1.65, H1 + 0.4, 7.6, 'upper'],
      ['En-suite', '2.85 × 1.8, shower', 1.65, H1 + 0.4, 5.3, 'upper'],
      ['Hall', '1.65 m deep', 5.0, H1 + 0.4, 5.3, 'upper'],
      ['Master bedroom', '4.32 × 4.0 ≈ 17.3 m²', 2.3, H1 + 0.4, 2.0, 'upper'],
      ['Work room', '2.33 × 3.2 ≈ 7.5 m²', 5.9, H1 + 0.4, 1.8, 'upper'],
      ['Bedroom', '3.0–3.2 × 5.8 ≈ 17.8 m², open', 8.6, H1 + 0.4, 3.4, 'upper'],
      ['Dressing area', 'open, part of the bedroom', 8.6, H1 + 0.4, 5.2, 'upper'],
      ['Garden stair', 'provisional, from the terrace', 8.2, H1 + 0.4, 15.4, 'upper', true],
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
    terrace: { cam: V(9.4, H1 + 1.6, 14.2), tgt: V(2.0, H1 + 1.2, 12.9), mode: 'all' },
    upper: { cam: V(5.2, 23, -1.5), tgt: V(5.2, H1, 6.6), mode: 'upper' },
    ground: { cam: V(5.2, 21, -1.5), tgt: V(5.2, 0, 6.4), mode: 'ground' },
    living: { cam: V(5.0, H1 + 1.6, 9.4), tgt: V(1.6, H1 + 1.1, 12.4), mode: 'all' },
    kitchen: { cam: V(9.5, H1 + 1.6, 12.0), tgt: V(6.0, H1 + 1.0, 9.6), mode: 'all' },
    bedroom: { cam: V(4.1, H1 + 1.6, 3.8), tgt: V(1.0, H1 + 0.9, 1.4), mode: 'all' },
    lobby: { cam: V(4.3, H1 + 1.6, 4.9), tgt: V(4.6, H1 + 1.1, 8.7), mode: 'all' },
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
