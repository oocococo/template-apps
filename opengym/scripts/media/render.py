"""Render an approved candidate into task data. Dependencies stay outside source.

python scripts/media/render.py --root TASK_ROOT --tools TOOL_CACHE \
    --motions MOTION_CACHE --exercise push_up
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

APP = Path(__file__).resolve().parents[2]


def run(command, **kwargs):
    subprocess.run([str(arg) for arg in command], check=True, **kwargs)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--tools", type=Path, required=True)
    parser.add_argument("--motions", type=Path, required=True)
    parser.add_argument("--exercise", required=True)
    parser.add_argument("--quality", choices=["preview", "final"], default="preview")
    parser.add_argument("--attempt", type=int, default=1)
    args = parser.parse_args()
    sources = json.loads((APP / "media/sources.json").read_text())
    approved = next((item for item in sources["motions"] if item["id"] == args.exercise), None)
    if not approved or approved["license"] not in ("CC0-1.0", "AGPL-3.0-only"):
        parser.error("Exercise is not in the approved source manifest")
    recipe = APP / "media/recipes" / (args.exercise + ".json")
    spec = json.loads(recipe.read_text())
    if approved.get("file"):
        if spec.get("mocap") != approved["file"] + "#" + approved["clip"]:
            parser.error("Recipe motion differs from approved source")
        motion = (args.motions / approved["file"]).resolve()
        if not motion.is_relative_to(args.motions.resolve()):
            parser.error("Motion escapes the motion cache")
        if hashlib.sha256(motion.read_bytes()).hexdigest() != approved["sha256"]:
            parser.error("Motion checksum mismatch")
    elif spec.get("authored", {}).get("method") != approved.get("method") or spec.get("mocap"):
        parser.error("Recipe differs from approved authored generator")
    tools = args.tools.resolve()
    blender = tools / "blender-4.5.11-linux-x64/blender"
    extension = tools / "mpfb-extension"
    if not blender.is_file() or not (extension / "blender_manifest.toml").is_file():
        parser.error("Provide verified Blender 4.5.11 and MPFB 2.0.16 in the private tools cache")
    if shutil.which("ffmpeg") is None:
        parser.error("ffmpeg is required")
    resources = tools / "blender-user"
    link = resources / "extensions/user_default/mpfb"
    link.parent.mkdir(parents=True, exist_ok=True)
    if not link.exists():
        link.symlink_to(extension, target_is_directory=True)
    if link.resolve() != extension:
        parser.error("Unexpected extension in isolated Blender resources")
    if args.attempt < 1:
        parser.error("Attempt must be positive")
    output = args.root.resolve() / "artifacts/media-candidates" / args.exercise / f"{args.quality}-{args.attempt}"
    if output.exists() and any(output.iterdir()):
        parser.error(f"Candidate output already exists: {output}; preserve it and use a fresh root")
    output.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, "BLENDER_USER_RESOURCES": str(resources), "FITX_ECORCHE": "0"}
    inputs = [recipe, APP/"scripts/media/blender_job.py", APP/"scripts/media/authored.py",
              APP/"scripts/media/vendor/opengym3d_builder.py", APP/"media/sources.json"]
    hashes = {str(path.relative_to(APP)):hashlib.sha256(path.read_bytes()).hexdigest() for path in inputs}
    (output/"input-snapshot.json").write_text(json.dumps(hashes,indent=2)+"\n")
    with (output / "blender.log").open("w") as log:
        run([blender, "--background", "--factory-startup", "--disable-autoexec",
             "--python-exit-code", "1", "--python", APP / "scripts/media/blender_job.py", "--",
             "--recipe", recipe, "--motions", args.motions.resolve(), "--output", output,
             "--quality", args.quality], env=env, stdout=log, stderr=subprocess.STDOUT)
    report = json.loads((output / "render.json").read_text())
    fps = str(report["sequenceFps"])
    # Blender step=2 produces 0001,0003,...; glob preserves that sequence.
    ffmpeg_input = ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-framerate", fps,
                    "-pattern_type", "glob", "-i", output / "frames/frame_*.png"]
    run(ffmpeg_input + ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "24", "-movflags", "+faststart", output / "video.mp4"])
    run(ffmpeg_input + ["-c:v", "libwebp_anim", "-loop", "0", "-quality", "70", output / "animation.webp"])
    run(ffmpeg_input + ["-filter_complex", "split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer", "-loop", "0", output / "animation.gif"])
    run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-i", output / "still.png",
         "-c:v", "libwebp", "-quality", "85", output / "still.webp"])
    report["artifacts"] = {name: {"bytes": (output/name).stat().st_size,
                                  "sha256": hashlib.sha256((output/name).read_bytes()).hexdigest()}
                           for name in ["still.webp", "video.mp4", "animation.webp", "animation.gif", "motion.glb"]}
    report["recipeSha256"] = hashlib.sha256(recipe.read_bytes()).hexdigest()
    report["motionSha256"] = approved.get("sha256")
    report["authoringSha256"] = hashlib.sha256((APP/"scripts/media/authored.py").read_bytes()).hexdigest()
    report["workerSha256"] = hashlib.sha256((APP/"scripts/media/blender_job.py").read_bytes()).hexdigest()
    report["generator"] = sources["generatorSource"]
    report["inputs"] = hashes
    report["inputsUnchanged"] = all(hashlib.sha256(path.read_bytes()).hexdigest() == hashes[str(path.relative_to(APP))] for path in inputs)
    (output / "render.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"output":str(output), "exercise":args.exercise,
                      "artifacts":report["artifacts"], "releaseEligible":False}, indent=2))


if __name__ == "__main__":
    main()
