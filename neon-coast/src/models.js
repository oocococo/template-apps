import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
export const mat = (color, extra = {}) =>
  new T.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
export const materials = {
  road: mat("#3f4654"),
  sidewalk: mat("#c6b5ac"),
  sand: mat("#e6c7a1"),
  line: mat("#efd5a1"),
  glass: mat("#263e50", { roughness: 0.21, metalness: 0.55 }),
  chrome: mat("#bbc7ce", { roughness: 0.18, metalness: 0.9 }),
  rubber: mat("#161d26"),
  trunk: mat("#8c7863"),
  leaf: mat("#326854", { side: T.DoubleSide }),
  dark: mat("#334750"),
};
export function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const o = new T.Mesh(new T.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}
export function cylinder(rt, rb, h, m, n = 10) {
  const o = new T.Mesh(new T.CylinderGeometry(rt, rb, h, n), m);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}
export function batchStatic(group) {
  const buckets = new Map();
  group.updateMatrixWorld(true);
  const moving = [];
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry.attributes.normal || Array.isArray(o.material))
      return;
    const key = o.material.uuid;
    const g = (
      o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
    ).applyMatrix4(o.matrixWorld);
    if (!g.attributes.uv)
      g.setAttribute(
        "uv",
        new T.Float32BufferAttribute(
          new Float32Array(g.attributes.position.count * 2),
          2,
        ),
      );
    if (!buckets.has(key)) buckets.set(key, { material: o.material, geos: [] });
    buckets.get(key).geos.push(g);
    moving.push(o);
  });
  for (const o of moving) o.removeFromParent();
  const out = new T.Group();
  for (const { material, geos } of buckets.values()) {
    const g = mergeGeometries(geos);
    if (g) {
      const mesh = new T.Mesh(g, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      out.add(mesh);
    }
    for (const geo of geos) geo.dispose();
  }
  return out;
}
export function car(color = "#e9789b", sport = false) {
  const g = new T.Group();
  const paint = new T.MeshPhysicalMaterial({
    color,
    roughness: 0.24,
    metalness: 0.65,
    clearcoat: 1,
    clearcoatRoughness: 0.15,
  });
  const glass = materials.glass;
  const light = mat("#ffe3bd", { emissive: "#ffd0a0", emissiveIntensity: 1.8 });
  const red = mat("#e72955", { emissive: "#ff173b", emissiveIntensity: 2 });
  // The coupe silhouette tapers at both ends, with an inset cabin and split rear grille.
  const shape = new T.Shape();
  shape.moveTo(-0.94, -2.1);
  shape.lineTo(0.94, -2.1);
  shape.quadraticCurveTo(1.12, -2.04, 1.13, -1.72);
  shape.lineTo(1.13, 1.65);
  shape.quadraticCurveTo(1.1, 2.08, 0.85, 2.15);
  shape.lineTo(-0.85, 2.15);
  shape.quadraticCurveTo(-1.1, 2.08, -1.13, 1.65);
  shape.lineTo(-1.13, -1.72);
  shape.quadraticCurveTo(-1.12, -2.04, -0.94, -2.1);
  const body = new T.Mesh(
    new T.ExtrudeGeometry(shape, {
      depth: 0.53,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.1,
      bevelThickness: 0.08,
    }),
    paint,
  );
  body.rotation.x = -Math.PI / 2;
  body.position.y = 0.53;
  body.castShadow = true;
  g.add(body);
  g.add(box(1.91, 0.1, 3.85, materials.dark, 0, 0.45, 0));
  const cabinGeo = new T.BufferGeometry();
  const v = [
    -0.91, 1.07, 0.94, 0.91, 1.07, 0.94, 0.72, 1.57, 0.32, -0.72, 1.57, 0.32,
    -0.72, 1.57, -0.67, 0.72, 1.57, -0.67, 0.91, 1.07, -1.18, -0.91, 1.07,
    -1.18,
  ];
  cabinGeo.setAttribute("position", new T.Float32BufferAttribute(v, 3));
  cabinGeo.setIndex([
    0, 1, 2, 0, 2, 3, 1, 6, 5, 1, 5, 2, 6, 7, 4, 6, 4, 5, 7, 0, 3, 7, 3, 4, 3,
    2, 5, 3, 5, 4,
  ]);
  cabinGeo.computeVertexNormals();
  const cabin = new T.Mesh(
    cabinGeo,
    new T.MeshPhysicalMaterial({
      color: "#345665",
      roughness: 0.09,
      metalness: 0.9,
      clearcoat: 1,
    }),
  );
  cabin.castShadow = true;
  g.add(cabin);
  const roof = new T.Mesh(
    new RoundedBoxGeometry(1.48, 0.12, 1.06, 3, 0.08),
    paint,
  );
  roof.position.set(0, 1.59, -0.18);
  g.add(roof);
  function bar(a, b, r, material) {
    const delta = new T.Vector3(...b).sub(new T.Vector3(...a));
    const mesh = cylinder(r, r, delta.length(), material, 8);
    mesh.position.copy(
      new T.Vector3(...a).add(new T.Vector3(...b)).multiplyScalar(0.5),
    );
    mesh.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      delta.normalize(),
    );
    g.add(mesh);
  }
  for (const side of [-1, 1]) {
    bar([side * 0.91, 1.07, 0.94], [side * 0.72, 1.58, 0.32], 0.045, paint);
    bar([side * 0.91, 1.07, -1.18], [side * 0.72, 1.58, -0.67], 0.065, paint);
    bar([side * 0.88, 1.09, -0.48], [side * 0.72, 1.57, -0.4], 0.035, paint);
    g.add(box(0.24, 0.11, 0.26, paint, side * 1.22, 1.18, 0.53));
    g.add(box(0.08, 0.045, 0.29, materials.chrome, side * 1.24, 0.9, -0.12));
    for (let j = 0; j < 5; j++)
      g.add(
        box(
          0.025,
          0.035,
          0.75,
          materials.dark,
          side * 1.235,
          0.65 + j * 0.075,
          -0.7,
        ),
      );
    g.add(box(0.022, 0.025, 2.9, materials.dark, side * 1.237, 0.59, 0));
  }
  for (let j = 0; j < 9; j++)
    g.add(box(0.075, 0.02, 0.49, materials.dark, (j - 4) * 0.14, 1.15, 1.28));
  g.add(box(1.88, 0.035, 0.08, materials.dark, 0, 1.12, 1.68));
  for (const x of [-0.78, 0.78]) {
    g.add(box(0.53, 0.19, 0.1, light, x, 0.92, 2.23));
    g.add(box(0.58, 0.16, 0.09, red, x, 0.91, -2.22));
  }
  g.add(box(1.9, 0.12, 0.15, materials.chrome, 0, 0.58, 2.23));
  g.add(box(1.9, 0.12, 0.15, materials.chrome, 0, 0.58, -2.23));
  g.add(box(0.8, 0.21, 0.02, mat("#efe8d1"), 0, 0.68, -2.32));
  for (let i = 0; i < 6; i++)
    g.add(box(1.35, 0.035, 0.06, materials.dark, 0, 1.11, -1.27 - i * 0.11));
  if (sport) {
    g.add(box(2.25, 0.12, 0.37, paint, 0, 1.35, -1.95));
    for (const x of [-0.7, 0.7])
      g.add(box(0.08, 0.3, 0.12, materials.dark, x, 1.2, -1.93));
  }
  const wheels = [];
  for (const z of [-1.35, 1.35])
    for (const x of [-1.12, 1.12]) {
      const wheel = new T.Group();
      const tire = cylinder(0.43, 0.43, 0.29, materials.rubber, 32);
      tire.rotation.z = Math.PI / 2;
      wheel.add(tire);
      const rim = cylinder(0.29, 0.29, 0.31, materials.chrome, 12);
      rim.rotation.z = Math.PI / 2;
      wheel.add(rim);
      const hub = cylinder(0.12, 0.12, 0.33, materials.dark, 12);
      hub.rotation.z = Math.PI / 2;
      wheel.add(hub);
      wheel.position.set(x, 0.44, z);
      g.add(wheel);
      for (let k = 0; k < 5; k++) {
        const spoke = box(
          0.025,
          0.49,
          0.045,
          materials.chrome,
          x > 0 ? 0.175 : -0.175,
          0,
          0,
        );
        spoke.rotation.x = (k * Math.PI) / 5;
        wheel.add(spoke);
      }
      wheels.push(wheel);
    }
  const fixed = new T.Group();
  for (const child of [...g.children])
    if (!wheels.includes(child)) fixed.add(child);
  g.add(batchStatic(fixed));
  g.userData = { wheels, paint };
  return g;
}
export function palm(height = 10, lean = 0.8) {
  const g = new T.Group();
  for (let i = 0; i < 7; i++) {
    const trunk = cylinder(
      0.18 + (7 - i) * 0.024,
      0.21 + (7 - i) * 0.026,
      height / 7 + 0.08,
      materials.trunk,
      7,
    );
    trunk.position.set(lean * (i / 7) ** 2, ((i + 0.5) * height) / 7, 0);
    trunk.rotation.z = (-lean * i) / (height * 3);
    g.add(trunk);
  }
  for (let k = 0; k < 12; k++) {
    const ang = (k * Math.PI * 2) / 12;
    const vertices = [],
      indices = [];
    for (let j = 0; j <= 40; j++) {
      const t = j / 40,
        r = t * 4.8,
        w = Math.sin(Math.PI * t) * (j % 2 ? 0.08 : 0.62) + 0.008;
      const y = height + Math.sin(t * Math.PI) * 1.3 - t * t * 1.4;
      for (const side of [-1, 1])
        vertices.push(
          lean + Math.sin(ang) * r + Math.cos(ang) * w * side,
          y,
          Math.cos(ang) * r - Math.sin(ang) * w * side,
        );
      if (j < 40) {
        const n = j * 2;
        indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new T.Mesh(geo, materials.leaf);
    mesh.castShadow = true;
    g.add(mesh);
  }
  return g;
}
export function person(shirt = "#faf1da") {
  const g = new T.Group();
  const skin = mat("#bd8d73");
  g.add(box(0.45, 0.7, 0.26, mat(shirt), 0, 1.07, 0));
  const head = new T.Mesh(new T.SphereGeometry(0.18, 8, 8), skin);
  head.position.y = 1.65;
  g.add(head);
  g.add(box(0.32, 0.14, 0.31, mat("#26232e"), 0, 1.78, 0));
  const legs = [];
  for (const x of [-0.13, 0.13]) {
    const leg = box(0.16, 0.64, 0.19, materials.dark, x, 0.4, 0);
    g.add(leg);
    legs.push(leg);
    g.add(box(0.13, 0.62, 0.14, skin, x * 2.4, 1, 0));
  }
  g.userData.legs = legs;
  return g;
}
export function textSign(text, color = "#ffb6d4", bg = "#273c53", width = 512) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, 128);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(7, 7, width - 14, 114);
  ctx.font = "bold 61px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = color;
  ctx.shadowBlur = 13;
  ctx.fillStyle = color;
  ctx.fillText(text, width / 2, 67, width - 40);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return new T.MeshBasicMaterial({ map: texture, toneMapped: false });
}
