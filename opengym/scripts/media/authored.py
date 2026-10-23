"""Independently authored movement recipes; no third-party video input.

World coordinates: +Z up, -Y forward. Two-bone IK keeps segment lengths
constant. These are candidates, requiring anatomical and motion review.
"""

import math

import bpy
from mathutils import Matrix, Quaternion, Vector


def two_bone(start, end, upper_length, lower_length, pole):
    direction = end - start
    distance = direction.length
    if not abs(upper_length-lower_length) + 1e-5 < distance < upper_length+lower_length - 1e-5:
        raise ValueError(f"IK target is unreachable: {distance}, lengths {upper_length}, {lower_length}")
    direction.normalize()
    along = (upper_length**2 - lower_length**2 + distance**2) / (2*distance)
    height = math.sqrt(max(0, upper_length**2 - along**2))
    side = pole - direction * pole.dot(direction)
    if side.length < 1e-6:
        raise ValueError("IK pole is parallel to its target")
    return start + direction * along + side.normalized() * height


def bear_crawl(builder, driver, rig, spec, end):
    cfg = spec["authored"]
    hip_height = cfg["hipHeight"]
    stride = cfg["stride"]
    lift = cfg["lift"]
    root = Vector(rig.pose.bones["root"].bone.head_local)
    turn = Quaternion((1, 0, 0), math.pi/2)
    rotation = turn.to_matrix()
    origin = Vector((0, 0, hip_height))
    offset = origin - root
    rest = lambda name: Vector(rig.pose.bones[name].bone.head_local)
    shoulders = {side:origin + rotation @ (rest("upperarm01"+side)-root) for side in (".L", ".R")}
    hips = {side:origin + rotation @ (rest("upperleg01"+side)-root) for side in (".L", ".R")}
    lengths = {}
    for side in (".L", ".R"):
        lengths[side] = [(rest(b+side)-rest(a+side)).length for a,b in
                         [("upperarm01", "lowerarm01"), ("lowerarm01", "wrist"),
                          ("upperleg01", "lowerleg01"), ("lowerleg01", "foot")]]
    diagnostics = []
    for frame in range(1, end+1):
        phase = (frame-1)/(end-1) * 2*math.pi
        builder_syn = driver.pose.bones["pelvis"]
        builder_syn.matrix = turn.to_matrix().to_4x4() @ builder_syn.bone.matrix_local
        bpy.context.view_layer.update()
        dirs = {name: Vector((0, -1, 0)) for name in ("spine", "chest", "neck", "head")}
        twists = {}
        targets = {}
        for side, sign in ((".L",1), (".R",-1)):
            arm_l1, arm_l2, leg_l1, leg_l2 = lengths[side]
            arm_phase = phase if side == ".L" else phase + math.pi
            leg_phase = arm_phase + math.pi  # opposite hand and foot advance together
            hand = Vector((shoulders[side].x, shoulders[side].y + stride*math.cos(arm_phase),
                           cfg["wristHeight"] + lift*max(0,math.sin(arm_phase))))
            ankle = Vector((hips[side].x, hips[side].y + cfg["footSetback"] + stride*math.cos(leg_phase),
                            cfg["ankleHeight"] + lift*max(0,math.sin(leg_phase))))
            elbow = two_bone(shoulders[side], hand, arm_l1, arm_l2, Vector((sign,0.4,0)))
            knee = two_bone(hips[side], ankle, leg_l1, leg_l2, Vector((0,-1,0)))
            dirs.update({"upper_arm"+side:(elbow-shoulders[side]).normalized(),
                         "forearm"+side:(hand-elbow).normalized(),
                         "hand"+side:Vector((0,-1,0)),
                         "thigh"+side:(knee-hips[side]).normalized(),
                         "shin"+side:(ankle-knee).normalized(),
                         "foot"+side:Vector((0,0.5,-1)).normalized()})
            twists["hand"+side] = Vector((0,0,-1))
            targets[side] = {"hand":list(hand), "ankle":list(ankle), "knee":list(knee)}
        builder.transfer_pose(driver, rig, offset, frame, dirs, twists)
        diagnostics.append({"frame":frame, "targets":targets})
    for curve in rig.animation_data.action.fcurves:
        for key in curve.keyframe_points:
            key.interpolation = "LINEAR"
    return diagnostics


METHODS = {"bear-crawl-ik/1":bear_crawl}


def animate(builder, driver, rig, spec, end):
    method = spec["authored"]["method"]
    if method not in METHODS:
        raise ValueError(f"Unrecognized authored motion method: {method}")
    return METHODS[method](builder, driver, rig, spec, end)
