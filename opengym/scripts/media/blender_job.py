"""Offline Blender worker. Invoked by render.py, never installs dependencies."""

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import sys

import bpy

sys.path.insert(0, str(Path(__file__).parent / "vendor"))
sys.path.insert(0, str(Path(__file__).parent))
import opengym3d_builder as builder
import authored


def joint_sample(rig):
    names = ["root", "head", "wrist.L", "wrist.R", "foot.L", "foot.R",
             "upperleg01.L", "upperleg01.R", "lowerleg01.L", "lowerleg01.R",
             "upperarm01.L", "upperarm01.R", "lowerarm01.L", "lowerarm01.R"]
    return {name: [round(v, 6) for v in rig.matrix_world @ rig.pose.bones[name].head]
            for name in names}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--recipe", required=True, type=Path)
    parser.add_argument("--motions", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--quality", choices=["preview", "final"], default="preview")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    spec = json.loads(args.recipe.read_text())
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    # Extension code, preferences and output are all isolated by render.py.
    bpy.ops.preferences.addon_enable(module="bl_ext.user_default.mpfb")
    builder.MOTIONS_DIR = str(args.motions.resolve())
    builder.MOCAP_DIR = str(args.motions.resolve())
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    scene = bpy.context.scene
    scene.render.fps = spec.get("fps", 30)
    source = spec.get("mocap")
    if source:
        if not source.startswith("cc0/") or not source.endswith(("#Pushup", "#Jumping Jacks", "#Crawl", "#Meditate", "#Jog", "#Sprint", "#Walk")):
            raise ValueError("Motion must be approved by media/sources.json before rendering")
        kind, arm, f0, f1 = builder.load_mocap(source, spec.get("mocap_yaw", 0))
        end = f1 - f0 + 1
    else:
        end = round(spec.get("duration", 2) * scene.render.fps)
    scene.frame_start, scene.frame_end = 1, end
    primary, secondary = builder.highlight_sets(spec)
    bones, parents = builder.full_skeleton()
    driver = builder.build_driver(bones, parents)
    mesh, rig = builder.create_human()
    builder.strip_helpers(mesh)
    builder.paint_muscles(mesh, rig, {"body": builder.make_body_material()}, primary, secondary)
    builder.smooth_figure(mesh)
    props = builder.build_props(spec)
    if source:
        builder.animate_mocap(arm, driver, rig, f0, f1, props, kind)
    elif spec.get("authored"):
        diagnostics = authored.animate(builder, driver, rig, spec, end)
        (out / "authoring.json").write_text(json.dumps(diagnostics, indent=2)+"\n")
    else:
        builder.animate(driver, rig, spec, end, props)
    bpy.data.objects.remove(driver, do_unlink=True)
    side = builder.camera_side(primary, spec)
    camera, target = builder.setup_render(side)
    # The upstream curved wall can enter the side camera as a black corner.
    # A large diffuse floor gives every camera the same neutral studio.
    backdrop = bpy.data.objects.get("Backdrop")
    if backdrop:
        bpy.data.objects.remove(backdrop, do_unlink=True)
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.008))
    floor = bpy.context.object
    floor.name = "StudioFloor"
    floor.visible_diffuse = False
    floor.visible_glossy = False
    floor.data.materials.append(builder.make_material("StudioFloor", (0.82, 0.84, 0.87, 1), roughness=0.9))
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 4
    scene.render.image_settings.file_format = "PNG"
    scene.cycles.samples = 16 if args.quality == "preview" else 64
    scene.render.resolution_x = scene.render.resolution_y = 384 if args.quality == "preview" else 512
    frames = list(range(1, end + 1))
    samples = []
    for frame in range(1, end + 1):
        scene.frame_set(frame)
        sample = joint_sample(rig)
        if not all(math.isfinite(v) for xyz in sample.values() for v in xyz):
            raise ValueError(f"Nonfinite joint positions at frame {frame}")
        samples.append({"frame": frame, "joints": sample})
    still = builder.peak_frame(rig, end) if source else 1 + (end - 1) // 2
    if spec.get("posterMetric") == "hands-highest":
        still = max(samples, key=lambda s:s["joints"]["wrist.L"][2]+s["joints"]["wrist.R"][2])["frame"]
    # A single stable camera for still and sequence, including the whole motion.
    builder.frame_subject(camera, target, mesh, frames, side, prop_objs=props)
    camera.data.type = "ORTHO"
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    inverse = camera.evaluated_get(deps).matrix_world.inverted()
    extent = 0
    for frame in frames:
        scene.frame_set(frame)
        deps = bpy.context.evaluated_depsgraph_get()
        for obj in [mesh] + [obj for obj,_ in props]:
            evaluated = obj.evaluated_get(deps)
            for corner in evaluated.bound_box:
                point = inverse @ (obj.matrix_world @ builder.Vector(corner))
                extent = max(extent, abs(point.x), abs(point.y))
    camera.data.ortho_scale = extent * 2.12
    scene.frame_set(still)
    scene.render.filepath = str(out / "still.png")
    bpy.ops.render.render(write_still=True)
    scene.render.resolution_x = scene.render.resolution_y = 224 if args.quality == "preview" else 320
    scene.cycles.samples = 6 if args.quality == "preview" else 16
    scene.frame_step = 2
    (out / "frames").mkdir(exist_ok=True)
    scene.render.filepath = str(out / "frames" / "frame_")
    bpy.ops.render.render(animation=True)
    # Selected objects only: no staging scene, source rig, lights or camera.
    bpy.ops.object.select_all(action="DESELECT")
    # Subdivision is useful for offline images; the source mesh is sufficient
    # for a phone viewer and avoids shipping four times as many vertices.
    for modifier in list(mesh.modifiers):
        if modifier.type == "SUBSURF":
            mesh.modifiers.remove(modifier)
    for obj in [mesh, rig] + [obj for obj, _ in props]:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(out / "motion.glb"), use_selection=True,
                              export_animation_mode="SCENE", export_apply=True,
                              export_cameras=False, export_lights=False)
    distance = lambda a, b: math.sqrt(sum((x-y)**2 for x, y in zip(a, b)))
    loop_delta = max(distance(samples[0]["joints"][name], samples[-1]["joints"][name])
                     for name in samples[0]["joints"])
    stats = {"exercise": spec["id"], "source": source, "frames": end,
             "sourceFps": scene.render.fps, "sequenceFps": scene.render.fps / 2,
             "stillFrame": still, "quality": args.quality,
             "maxLoopJointDeltaMetres": round(loop_delta, 6),
             "samples": samples, "visualReview": "pending",
             "semanticReview": "pending", "releaseEligible": False}
    (out / "render.json").write_text(json.dumps(stats, indent=2) + "\n")
    print("OPENGYM_RENDER " + json.dumps({k:v for k,v in stats.items() if k != "samples"}))


if __name__ == "__main__":
    main()
