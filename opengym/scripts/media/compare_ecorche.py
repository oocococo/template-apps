"""Research still only: independently shade the open Ecorche model in Blender.

No skeleton is added and no animation is claimed. Geometry: Charleeh/ecorche,
CC BY-SA 4.0, from BodyParts3D (DBCLS) and Z-Anatomy (Gauthier Kervyn).
"""

import argparse
import hashlib
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector


def material(name, color, ink=False):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = 0.9
    if ink:
        # A generic EEVEE illustration material, built from Blender nodes.
        # No reference image, traced texture or borrowed illustration is used.
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        nodes.clear()
        diffuse = nodes.new("ShaderNodeBsdfDiffuse")
        diffuse.inputs["Color"].default_value = (1, 1, 1, 1)
        rgb = nodes.new("ShaderNodeShaderToRGB")
        links.new(diffuse.outputs[0], rgb.inputs[0])
        tone = nodes.new("ShaderNodeValToRGB")
        tone.color_ramp.elements[0].position = 0.1
        tone.color_ramp.elements[0].color = (0.3, 0.3, 0.3, 1)
        tone.color_ramp.elements[1].position = 0.9
        tone.color_ramp.elements[1].color = (1, 1, 1, 1)
        links.new(rgb.outputs[0], tone.inputs[0])
        tint = nodes.new("ShaderNodeMixRGB")
        tint.blend_type = "MULTIPLY"
        tint.inputs[0].default_value = 1
        tint.inputs[1].default_value = (*color, 1)
        links.new(tone.outputs[0], tint.inputs[2])
        facing = nodes.new("ShaderNodeLayerWeight")
        edge = nodes.new("ShaderNodeValToRGB")
        edge.color_ramp.elements[0].position = 0.12
        edge.color_ramp.elements[0].color = (1, 1, 1, 1)
        edge.color_ramp.elements[1].position = 0.6
        edge.color_ramp.elements[1].color = (0.025, 0.025, 0.025, 1)
        links.new(facing.outputs["Fresnel"], edge.inputs[0])
        multiply = nodes.new("ShaderNodeMixRGB")
        multiply.blend_type = "MULTIPLY"
        multiply.inputs[0].default_value = 1
        links.new(tint.outputs[0], multiply.inputs[1])
        links.new(edge.outputs[0], multiply.inputs[2])
        emission = nodes.new("ShaderNodeEmission")
        links.new(multiply.outputs[0], emission.inputs[0])
        output = nodes.new("ShaderNodeOutputMaterial")
        links.new(emission.outputs[0], output.inputs[0])
    return mat


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--style", choices=["shaded", "ink"], default="shaded")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    output = args.root.resolve() / "artifacts/media-comparison/ecorche"
    output.mkdir(parents=True, exist_ok=True)
    image_name = "independent-grey.png" if args.style == "shaded" else "independent-ink.png"
    if (output / image_name).exists():
        parser.error("Preserve the existing experiment")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(args.model.resolve()))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    gray = material("Independent neutral gray", (0.63, 0.65, 0.67), ink=args.style == "ink")
    red = material("Quadriceps identification", (0.65, 0.025, 0.035), ink=args.style == "ink")
    highlighted = []
    for obj in meshes:
        name = obj.get("name", obj.name).lower()
        chosen = any(word in name for word in ("rectus femoris", "vastus lateralis", "vastus medialis"))
        obj.data.materials.clear()
        obj.data.materials.append(red if chosen else gray)
        if chosen:
            highlighted.append(obj.name)
    bounds = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    low = Vector(tuple(min(v[i] for v in bounds) for i in range(3)))
    high = Vector(tuple(max(v[i] for v in bounds) for i in range(3)))
    center = (low + high) / 2
    height = high.z - low.z
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.eevee.taa_render_samples = 64
    scene.render.resolution_x = 600
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.world.color = (1, 1, 1)
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1)
    scene.world.node_tree.nodes["Background"].inputs[1].default_value = 1 if args.style == "ink" else 0.65
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast" if "Medium High Contrast" in [x.name for x in bpy.types.ColorManagedViewSettings.bl_rna.properties["look"].enum_items] else "None"
    bpy.ops.object.camera_add(location=center + Vector((height * 1.7, -height * 4, height * 0.25)))
    camera = bpy.context.object
    camera.rotation_euler = (center - camera.location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = height * 1.12
    scene.camera = camera
    bpy.ops.object.light_add(type="AREA", location=center + Vector((-height * 2, -height * 3, height * 3)))
    bpy.context.object.data.energy = 650
    bpy.context.object.data.shape = "DISK"
    bpy.context.object.data.size = height * 3
    bpy.ops.mesh.primitive_plane_add(size=height * 200, location=(0, 0, low.z - 0.002))
    floor = material("White studio", (1, 1, 1))
    if args.style == "ink":
        floor.node_tree.nodes["Principled BSDF"].inputs["Emission Color"].default_value = (1, 1, 1, 1)
        floor.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 1
    bpy.context.object.data.materials.append(floor)
    # The quantized atlas contains coincident edges; Freestyle's global
    # visibility pass is unsuitable for a quick unchanged-geometry preview.
    scene.render.use_freestyle = False
    scene.render.filepath = str(output / image_name)
    bpy.ops.render.render(write_still=True)
    report = {"source": "Charleeh/ecorche", "commit": "320805e06aee51e2e6f6b22533eb2a59d43f2d4d",
              "modelSha256": hashlib.sha256(args.model.read_bytes()).hexdigest(),
              "geometryLicense": "CC-BY-SA-4.0", "meshObjects": len(meshes),
              "rigs": 0, "animations": 0, "highlighted": highlighted,
              "style": args.style, "outlines": "Fresnel edge shading" if args.style == "ink" else False,
              "purpose": "Static style feasibility only; not a working exercise animation",
              "productionApproved": False, "blender": bpy.app.version_string,
              "attribution": "Ecorche by Charleeh; BodyParts3D (DBCLS), CC BY 4.0; Z-Anatomy (Gauthier Kervyn), CC BY-SA 4.0"}
    report_name = "render.json" if args.style == "shaded" else "render-ink.json"
    (output / report_name).write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
