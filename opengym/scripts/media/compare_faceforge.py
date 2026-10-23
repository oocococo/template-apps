"""Research only: run the pinned FaceForge renderer on Linux using GLFW.

Upstream's headless context helper uses Apple's CGL. This adapter supplies a
hidden GLFW context and uses its original scene, poses, deformation and GL
renderer unchanged. Run under xvfb-run; output is a candidate, not app media.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--project", type=Path, required=True)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--exercise", default="barbell_back_squat")
    parser.add_argument("--frames", type=int, default=36)
    parser.add_argument("--camera", default="three_quarter")
    args = parser.parse_args()
    project = args.project.resolve()
    dataset = args.dataset.resolve()
    metadata = json.loads((project / "repository.json").read_text())
    if metadata["commit"] != "cab98987a6df9b8b2ec6347bde0fc00996b690de":
        parser.error("Use the pinned research source")
    if len(list(dataset.glob("*.stl"))) < 900:
        parser.error("The anatomical dataset is incomplete")
    output = args.root.resolve() / "artifacts/media-comparison/faceforge" / (args.exercise + "-" + args.camera)
    output.mkdir(parents=True, exist_ok=True)
    if list(output.glob("*_000.png")):
        parser.error("Preserve the existing experiment before making another")
    os.environ["FACEFORGE_PROJECT_ROOT"] = str(project)
    os.environ["FACEFORGE_STL_DIR"] = str(dataset)
    os.chdir(project)
    sys.path[:0] = [str(project / "src"), str(project)]

    import glfw
    from OpenGL import GL
    from tools import glcontext

    if not glfw.init():
        raise RuntimeError("GLFW could not initialise")
    glfw.window_hint(glfw.VISIBLE, glfw.FALSE)
    glfw.window_hint(glfw.CONTEXT_VERSION_MAJOR, 3)
    glfw.window_hint(glfw.CONTEXT_VERSION_MINOR, 3)
    glfw.window_hint(glfw.OPENGL_PROFILE, glfw.OPENGL_CORE_PROFILE)
    window = glfw.create_window(640, 800, "FaceForge comparison", None, None)
    if not window:
        glfw.terminate()
        raise RuntimeError("GLFW could not create the hidden context")
    glfw.make_context_current(window)

    def acquire_context(prefer="auto"):
        def string(enum):
            raw = GL.glGetString(enum)
            return raw.decode("utf-8") if raw else "<null>"
        return glcontext.GLContextInfo(
            kind="glfw-linux-software", gl_version=string(GL.GL_VERSION),
            gl_renderer=string(GL.GL_RENDERER), gl_vendor=string(GL.GL_VENDOR),
            glsl_version=string(GL.GL_SHADING_LANGUAGE_VERSION),
            max_clip_distances=int(GL.glGetIntegerv(GL.GL_MAX_CLIP_DISTANCES)),
            attempts=["Hidden GLFW context under Xvfb; upstream GL renderer"],
        )

    glcontext.acquire_offscreen_gl = acquire_context
    info = acquire_context().as_manifest_dict()
    info["is_software"] = True  # llvmpipe is not recognized by the upstream CGL check.
    info.update({"source": metadata["repo"], "commit": metadata["commit"],
                 "adapterSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                 "framesRequested": args.frames, "exercise": args.exercise, "camera": args.camera,
                 "purpose": "research-only", "productionApproved": False})
    (output / "comparison-runtime.json").write_text(json.dumps(info, indent=2) + "\n")
    print(json.dumps(info), flush=True)
    try:
        from tools.render_exercise_demo import main as render_main
        result = render_main(["--exercise", args.exercise, "--frames", str(args.frames),
                              "--reps", "1", "--size", "640x800", "--camera", args.camera,
                              "--all-muscles", "--out", str(output), "--verbose"])
    finally:
        glfw.destroy_window(window)
        glfw.terminate()
    return result


if __name__ == "__main__":
    raise SystemExit(main())
