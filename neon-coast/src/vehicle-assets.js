import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
let concept;
export async function loadVehicles(assetBase) {
  concept = (
    await new GLTFLoader().loadAsync(
      new URL("vehicles/concept.glb", assetBase).href,
    )
  ).scene;
  concept.updateMatrixWorld(true);
}
export function detailedCar(color) {
  const root = new T.Group(),
    source = concept.clone(true);
  const remove = [];
  source.traverse((o) => {
    if (/License|Emblem/.test(o.name)) remove.push(o);
  });
  for (const o of remove) o.removeFromParent();
  source.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(source),
    size = bounds.getSize(new T.Vector3()),
    center = bounds.getCenter(new T.Vector3());
  const scale = 4.65 / size.z;
  const normalize = new T.Matrix4()
    .makeScale(scale, scale, scale)
    .multiply(
      new T.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z),
    );
  const wheels = [],
    materials = new Map();
  const materialFor = (m) => {
    if (!materials.has(m.uuid)) {
      const copy = m.clone();
      if (copy.name.startsWith("Paint 1")) {
        copy.color.set(color);
        copy.metalness = 0.85;
        copy.roughness = 0.26;
        copy.iridescence = 0;
        copy.normalMap = null;
      }
      if (copy.name === "Glass") {
        copy.transmission = 0;
        copy.color.set("#46606b");
        copy.metalness = 0.6;
        copy.roughness = 0.16;
        copy.transparent = false;
        copy.opacity = 1;
      }
      materials.set(m.uuid, copy);
    }
    return materials.get(m.uuid);
  };
  function bake(objects, offset = new T.Vector3()) {
    const buckets = new Map(),
      group = new T.Group();
    for (const o of objects) {
      const mat = materialFor(o.material),
        key = mat.uuid;
      let geo = o.geometry.index
        ? o.geometry.toNonIndexed()
        : o.geometry.clone();
      geo.applyMatrix4(normalize.clone().multiply(o.matrixWorld));
      geo.translate(-offset.x, -offset.y, -offset.z);
      if (!geo.getAttribute("uv"))
        geo.setAttribute(
          "uv",
          new T.Float32BufferAttribute(
            new Float32Array(geo.getAttribute("position").count * 2),
            2,
          ),
        );
      for (const name of Object.keys(geo.attributes))
        if (!["position", "normal", "uv"].includes(name))
          geo.deleteAttribute(name);
      if (!buckets.has(key)) buckets.set(key, { mat, geos: [] });
      buckets.get(key).geos.push(geo);
    }
    for (const { mat, geos } of buckets.values()) {
      const geo = mergeGeometries(geos);
      for (const g of geos) g.dispose();
      const mesh = new T.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }
  const wheelMeshes = new Set();
  for (const name of [
    "WheelFrontL",
    "WheelFrontR",
    "WheelRearL",
    "WheelRearR",
  ]) {
    const node = source.getObjectByName(name),
      objects = [];
    node.traverse((o) => {
      if (o.isMesh) {
        objects.push(o);
        wheelMeshes.add(o);
      }
    });
    const pivot = new T.Box3()
      .setFromObject(node)
      .getCenter(new T.Vector3())
      .applyMatrix4(normalize);
    const wheel = bake(objects, pivot);
    wheel.position.copy(pivot);
    if (name.includes("Front"))
      for (const mesh of wheel.children) mesh.geometry.rotateY(Math.PI / 6);
    root.add(wheel);
    wheels.push(wheel);
  }
  const body = [];
  source.traverse((o) => {
    if (o.isMesh && !wheelMeshes.has(o)) body.push(o);
  });
  root.add(bake(body));
  root.userData = {
    wheels,
    paint: [...materials.values()].find((m) => m.name.startsWith("Paint 1")),
    vehicleId: "comet",
    footprint: { hx: (size.x * scale) / 2 + 0.05, hz: 2.4 },
    radius: 0.38,
  };
  return root;
}
