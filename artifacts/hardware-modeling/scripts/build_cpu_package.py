import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(r"C:/Users/Berry/dsh-workspace/ai-research-intelligence-center")
OUT = ROOT / "artifacts" / "hardware-modeling"
SOURCE = OUT / "source" / "cpu-package.blend"
PREVIEWS = OUT / "previews"
GLB = ROOT / "frontend" / "public" / "models" / "hardware" / "cpu-package.glb"
MANIFEST = ROOT / "frontend" / "public" / "models" / "hardware" / "cpu-package.manifest.json"

for directory in (SOURCE.parent, PREVIEWS, GLB.parent):
    directory.mkdir(parents=True, exist_ok=True)


def material(name, color, roughness=0.45, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


bpy.ops.wm.read_factory_settings(use_empty=True)

MATS = {
    "substrate": material("CPU substrate · blue green", (0.035, 0.20, 0.19), 0.37, 0.16),
    "substrate_edge": material("CPU substrate edge", (0.02, 0.08, 0.075), 0.45, 0.12),
    "lid": material("CPU heat spreader · nickel", (0.54, 0.59, 0.61), 0.25, 0.82),
    "lid_edge": material("CPU heat spreader edge", (0.24, 0.29, 0.31), 0.3, 0.72),
    "silicon": material("CPU die · silicon", (0.045, 0.095, 0.12), 0.28, 0.23),
    "silicon_region": material("CPU die regions", (0.08, 0.22, 0.25), 0.34, 0.17),
    "gold": material("CPU contacts · gold", (0.78, 0.42, 0.08), 0.22, 0.88),
    "copper": material("CPU routing · copper", (0.62, 0.22, 0.075), 0.3, 0.78),
    "solder": material("CPU solder", (0.52, 0.55, 0.53), 0.2, 0.72),
    "ceramic": material("CPU package ceramic", (0.42, 0.46, 0.45), 0.42, 0.18),
    "black": material("CPU marking", (0.012, 0.018, 0.02), 0.3, 0.16),
    "white": material("CPU etched marking", (0.74, 0.78, 0.77), 0.32, 0.25),
    "floor": material("Studio floor", (0.12, 0.15, 0.16), 0.78, 0.0),
}


def empty(name, parent=None):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "PLAIN_AXES"
    if parent:
        obj.parent = parent
    return obj


def link_parent(obj, parent):
    obj.parent = parent


def box(name, location, dimensions, mat, parent, bevel=0.025):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("machined edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    obj.data.materials.append(mat)
    link_parent(obj, parent)
    return obj


def cylinder(name, location, radius, depth, mat, parent, vertices=20, rotation=None, bevel=0.008):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation or (0, 0, 0))
    obj = bpy.context.object
    obj.name = name
    if bevel:
        modifier = obj.modifiers.new("rounded edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    obj.data.materials.append(mat)
    link_parent(obj, parent)
    return obj


def trace(name, start, end, width, depth, mat, parent):
    start_vec = Vector(start)
    end_vec = Vector(end)
    middle = (start_vec + end_vec) * 0.5
    delta = end_vec - start_vec
    obj = box(name, middle, (width, delta.length, depth), mat, parent, min(width, depth) * 0.3)
    obj.rotation_euler[2] = math.atan2(delta.x, delta.y)
    return obj


def rounded_marker(parent):
    marker = box("cpu-lid · orientation marker", (-0.82, 0.82, 0.335), (0.22, 0.055, 0.012), MATS["gold"], parent, 0.012)
    marker.rotation_euler[2] = math.radians(-45)
    return marker


def setup_scene():
    scene = bpy.context.scene
    if scene.world is None:
        scene.world = bpy.data.worlds.new("CPU Studio World")
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 700
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.025, 0.03, 0.035)
    model_collection = bpy.data.collections.new("CPU quality sample")
    scene.collection.children.link(model_collection)
    root = bpy.data.objects.new("cpu", None)
    model_collection.objects.link(root)
    package = bpy.data.objects.new("cpu-package", None)
    model_collection.objects.link(package)
    package.parent = root
    lid = bpy.data.objects.new("cpu-lid", None)
    model_collection.objects.link(lid)
    lid.parent = package
    substrate = bpy.data.objects.new("cpu-substrate", None)
    model_collection.objects.link(substrate)
    substrate.parent = package
    die = bpy.data.objects.new("cpu-die", None)
    model_collection.objects.link(die)
    die.parent = package
    contacts = bpy.data.objects.new("cpu-contacts", None)
    model_collection.objects.link(contacts)
    contacts.parent = package
    return scene, model_collection, root, package, lid, substrate, die, contacts


def build_geometry(root, package, lid, substrate, die, contacts):
    box("cpu-substrate · main package board", (0, 0, 0.03), (2.62, 2.62, 0.18), MATS["substrate"], substrate, 0.075)
    box("cpu-substrate · ceramic carrier", (0, 0, 0.145), (2.38, 2.38, 0.065), MATS["ceramic"], substrate, 0.045)
    box("cpu-lid · nickel heat spreader", (0, 0, 0.285), (2.28, 2.28, 0.24), MATS["lid"], lid, 0.09)
    box("cpu-lid · raised contact surface", (0, 0, 0.415), (1.88, 1.88, 0.025), MATS["lid_edge"], lid, 0.035)
    rounded_marker(lid)
    box("cpu-lid · dark identification plate", (-0.32, 0.34, 0.433), (0.52, 0.12, 0.012), MATS["black"], lid, 0.018)
    for index in range(4):
        trace(f"cpu-lid · etched line {index + 1}", (-0.9, -0.42 + index * 0.16, 0.433), (0.72, -0.42 + index * 0.16, 0.433), 0.012, 0.008, MATS["white"], lid)

    box("cpu-die · silicon body", (0, 0, 0.255), (1.18, 1.18, 0.06), MATS["silicon"], die, 0.025)
    for row in range(2):
        for col in range(2):
            box(f"cpu-die · region {row * 2 + col + 1}", (-0.31 + col * 0.62, -0.31 + row * 0.62, 0.292), (0.48, 0.48, 0.018), MATS["silicon_region"], die, 0.018)
    box("cpu-die · memory controller region", (0.0, -0.52, 0.305), (0.62, 0.11, 0.018), MATS["copper"], die, 0.014)

    for row in range(10):
        for col in range(10):
            x = -1.03 + col * 0.229
            y = -1.03 + row * 0.229
            cylinder(f"cpu-contacts · land {row + 1:02d}-{col + 1:02d}", (x, y, -0.085), 0.055, 0.018, MATS["gold"], contacts, 16)
    for row in range(8):
        for col in range(8):
            x = -0.80 + col * 0.229
            y = -0.80 + row * 0.229
            cylinder(f"cpu-package · solder ball {row + 1:02d}-{col + 1:02d}", (x, y, 0.16), 0.038, 0.025, MATS["solder"], contacts, 14)

    for index in range(8):
        y = -0.82 + index * 0.235
        trace(f"cpu-substrate · vertical route {index + 1}", (-1.12, y, 0.19), (-0.67, y, 0.19), 0.018, 0.012, MATS["copper"], substrate)
        trace(f"cpu-substrate · horizontal route {index + 1}", (0.68, y, 0.19), (1.12, y, 0.19), 0.018, 0.012, MATS["copper"], substrate)
    for index in range(4):
        trace(f"cpu-substrate · die route {index + 1}", (-0.55 + index * 0.36, -1.12, 0.20), (-0.32 + index * 0.21, -0.58, 0.20), 0.016, 0.012, MATS["copper"], substrate)

    # A small side-wall cutaway cue makes the package layering readable without claiming a real delid operation.
    box("cpu-package · teaching cutaway edge", (1.17, 0.0, 0.30), (0.035, 1.35, 0.34), MATS["substrate_edge"], package, 0.012)
    for index, z in enumerate((0.16, 0.25, 0.34)):
        box(f"cpu-package · layer seam {index + 1}", (1.20, 0.0, z), (0.04, 0.92, 0.012), MATS["gold" if index == 1 else "copper"], package, 0.004)


def setup_lights(scene, camera_location, target):
    bpy.ops.object.camera_add(location=camera_location)
    camera = bpy.context.object
    camera.name = "Camera"
    scene.camera = camera
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 58
    for name, location, energy, size, color in (
        ("Key", (4.5, -4.0, 6.0), 950, 4.0, (1.0, 0.86, 0.72)),
        ("Fill", (-4.0, 2.0, 3.5), 700, 5.0, (0.64, 0.78, 1.0)),
        ("Rim", (1.5, 4.5, 4.0), 850, 3.0, (0.78, 0.92, 1.0)),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        light.data.color = color
        light.rotation_euler = (Vector(target) - light.location).to_track_quat("-Z", "Y").to_euler()
    bpy.ops.mesh.primitive_plane_add(size=16, location=(0, 0, -0.65))
    floor = bpy.context.object
    floor.name = "Studio floor"
    floor.data.materials.append(MATS["floor"])


def render_preview(scene, camera_location, target, filename, hide_floor=False):
    camera = scene.camera
    camera.location = camera_location
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(PREVIEWS / filename)
    floor = scene.objects.get("Studio floor")
    previous_floor_state = floor.hide_render if floor else False
    if floor and hide_floor:
        floor.hide_render = True
    bpy.ops.render.render(write_still=True)
    if floor:
        floor.hide_render = previous_floor_state


def is_model_object(obj, root):
    current = obj
    while current:
        if current == root:
            return True
        current = current.parent
    return False


def main():
    scene, model_collection, root, package, lid, substrate, die, contacts = setup_scene()
    build_geometry(root, package, lid, substrate, die, contacts)
    setup_lights(scene, (4.9, -5.2, 4.4), (0, 0, 0.15))
    render_preview(scene, (4.9, -5.2, 4.4), (0, 0, 0.15), "cpu-package-front-three-quarter.png")
    render_preview(scene, (4.6, 4.8, -3.6), (0, 0, -0.02), "cpu-package-contacts-three-quarter.png", hide_floor=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))

    for obj in list(bpy.context.scene.objects):
        if not is_model_object(obj, root):
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.context.view_layer.objects.active = root
    root.select_set(True)
    for obj in root.children_recursive:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(GLB), export_format="GLB", use_selection=True, export_apply=True, export_cameras=False, export_lights=False)
    meshes = [obj for obj in root.children_recursive if obj.type == "MESH"]
    triangles = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
    manifest = {
        "assetVersion": "cpu-quality-sample-1",
        "software": "Blender 5.2.1 LTS",
        "model": "cpu-package",
        "role": "independent CPU package quality asset",
        "dimensions": [2.62, 2.62, 0.52],
        "metrics": {"meshObjects": len(meshes), "triangles": triangles, "glbBytes": GLB.stat().st_size},
        "nodes": ["cpu", "cpu-package", "cpu-lid", "cpu-substrate", "cpu-die", "cpu-contacts"],
        "simplifications": [
            "Contact land and solder arrays are educationally spaced representations.",
            "Die regions and routing are architecture teaching cues, not a literal silicon floorplan.",
            "Top-lid cutaway seam is a visual teaching aid and does not imply user-serviceable delidding.",
        ],
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print("LUNA_CPU_BUILD_COMPLETE", SOURCE, GLB, len(meshes), triangles)


if __name__ == "__main__":
    main()
