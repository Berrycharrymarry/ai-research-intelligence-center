"""Build and export the Luna teaching graphics-card quality sample in Blender.

This is intentionally procedural but creates a real editable Blender scene: every
learnable assembly is an Empty parent with separately editable child meshes.
Run with: blender -b --python build_graphics_card.py
"""
import bpy
import json
import math
import os
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
SOURCE = os.path.join(ROOT, "artifacts", "hardware-modeling", "source")
PREVIEWS = os.path.join(ROOT, "artifacts", "hardware-modeling", "previews")
PUBLIC = os.path.join(ROOT, "frontend", "public", "models", "hardware")
os.makedirs(SOURCE, exist_ok=True)
os.makedirs(PREVIEWS, exist_ok=True)
os.makedirs(PUBLIC, exist_ok=True)

COLORS = {
    "pcb": (0.025, 0.16, 0.13, 1), "pcb_edge": (0.04, 0.25, 0.20, 1),
    "black": (0.018, 0.023, 0.027, 1), "plastic": (0.07, 0.08, 0.085, 1),
    "plastic_dark": (0.025, 0.03, 0.035, 1), "aluminum": (0.48, 0.52, 0.53, 1),
    "silver": (0.7, 0.74, 0.75, 1), "copper": (0.55, 0.20, 0.075, 1),
    "gold": (0.72, 0.46, 0.08, 1), "silicon": (0.08, 0.29, 0.19, 1),
    "ceramic": (0.68, 0.69, 0.64, 1), "red": (0.48, 0.055, 0.045, 1),
}

def material(name, color, metallic=0.0, roughness=0.5):
    m = bpy.data.materials.new(name)
    m.diffuse_color = color
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return m

MATS = {
    "pcb": material("PCB · matte green", COLORS["pcb"], 0.05, 0.52),
    "pcb_edge": material("PCB edge", COLORS["pcb_edge"], 0.08, 0.48),
    "black": material("Graphite", COLORS["black"], 0.05, 0.34),
    "plastic": material("Textured plastic", COLORS["plastic"], 0.0, 0.42),
    "plastic_dark": material("Dark plastic", COLORS["plastic_dark"], 0.0, 0.5),
    "aluminum": material("Anodized aluminum", COLORS["aluminum"], 0.78, 0.3),
    "silver": material("Brushed silver", COLORS["silver"], 0.85, 0.24),
    "copper": material("Copper heat pipe", COLORS["copper"], 0.85, 0.24),
    "gold": material("Contact gold", COLORS["gold"], 0.8, 0.2),
    "silicon": material("Silicon teaching insert", COLORS["silicon"], 0.2, 0.38),
    "ceramic": material("Package ceramic", COLORS["ceramic"], 0.05, 0.44),
    "red": material("VRM marker", COLORS["red"], 0.2, 0.32),
}

def collection(name, parent=None):
    c = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(c)
    return c

ROOT_COL = None
NODES = {}

def node(node_id, parent=None):
    e = bpy.data.objects.new(node_id, None)
    e.empty_display_type = "CUBE"
    e.empty_display_size = 0.16
    ROOT_COL.objects.link(e)
    if parent:
        e.parent = parent
    NODES[node_id] = e
    return e

def finish(obj, mat_key, parent, bevel=0.0):
    obj.data.materials.append(MATS[mat_key])
    if parent:
        obj.parent = parent
    if bevel:
        mod = obj.modifiers.new("Precision edge bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        mod.limit_method = "ANGLE"
    for p in obj.data.polygons:
        p.use_smooth = False
    return obj

def box(name, size, loc, mat_key, parent, bevel=0.04, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, mat_key, parent, bevel)

def cyl(name, radius, depth, loc, mat_key, parent, rot=(0, 0, 0), vertices=32, bevel=0.02):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    return finish(o, mat_key, parent, bevel)

def torus(name, major, minor, loc, mat_key, parent, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=48, minor_segments=12, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    return finish(o, mat_key, parent, 0)

def polygon_prism(name, points, z0, z1, mat_key, parent, bevel=0.03):
    verts = [(x, y, z0) for x, y in points] + [(x, y, z1) for x, y in points]
    n = len(points)
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    o = bpy.data.objects.new(name, mesh)
    ROOT_COL.objects.link(o)
    return finish(o, mat_key, parent, bevel)

def curve_pipe(name, points, radius, parent):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 12
    curve.bevel_depth = radius
    curve.bevel_resolution = 4
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for b, co in zip(spline.bezier_points, points):
        b.co = co
        b.handle_left_type = "AUTO"
        b.handle_right_type = "AUTO"
    o = bpy.data.objects.new(name, curve)
    ROOT_COL.objects.link(o)
    o.data.materials.append(MATS["copper"])
    o.parent = parent
    return o

def blade(name, angle, parent, z=0.32):
    # A tapered, curved 3D blade profile, not a flat radial rectangle.
    pts = []
    for radius, tangent in [(0.18, -0.13), (0.33, -0.16), (0.69, 0.08), (0.76, 0.19), (0.44, 0.04)]:
        a = angle + tangent
        pts.append((radius * math.cos(a), radius * math.sin(a)))
    o = polygon_prism(name, pts, z - 0.035, z + 0.035, "plastic", parent, 0.025)
    return o

def fan_assembly(parent, center, label):
    f = node(label, parent)
    cx, cy, cz = center
    cyl(label + " · fan frame", 0.94, 0.14, center, "plastic_dark", f, rot=(0, 0, 0), vertices=48, bevel=0.03)
    torus(label + " · shroud ring", 0.82, 0.055, (cx, cy, cz + 0.09), "aluminum", f)
    cyl(label + " · hub", 0.22, 0.19, (cx, cy, cz + 0.13), "aluminum", f, vertices=32, bevel=0.03)
    for i in range(9):
        blade(label + f" · curved blade {i+1:02d}", i * 2 * math.pi / 9, f, cz + 0.19)
    return f

def screw(name, loc, parent, rot=(0, 0, 0)):
    cyl(name + " · head", 0.075, 0.035, loc, "silver", parent, rot=rot, vertices=24, bevel=0.012)
    # small cross driver recess represented as two dark bars
    box(name + " · slot A", (0.07, 0.014, 0.008), (loc[0], loc[1], loc[2] + 0.021), "black", parent, 0, rot=rot)
    box(name + " · slot B", (0.014, 0.07, 0.008), (loc[0], loc[1], loc[2] + 0.022), "black", parent, 0, rot=rot)

def build_gpu():
    global ROOT_COL
    ROOT_COL = collection("LUNA_GPU_QUALITY_SAMPLE")
    gpu = node("gpu")
    gpu["nodeId"] = "gpu"
    gpu["assetRole"] = "complete graphics card"
    cooler = node("gpu-cooler", gpu)
    package = node("gpu-package", gpu)
    vram = node("gpu-vram", gpu)
    power = node("gpu-power-zone", gpu)
    pcb_node = node("gpu-pcb", gpu)
    back = node("gpu-backplate", gpu)
    ports = node("gpu-ports", gpu)
    substrate = node("gpu-substrate", package)
    die = node("gpu-die", package)
    vram_pkg = node("gpu-vram-package", vram)
    vrm = node("gpu-vrm", power)
    # 10.5 x 4.1 teaching scale, XY board plane, Z thickness.
    board_outline = [(-5.25, -1.9), (-4.65, -2.06), (3.95, -2.06), (4.45, -1.72), (5.25, -1.3), (5.25, 1.82), (4.72, 2.04), (-4.8, 2.04), (-5.25, 1.62)]
    polygon_prism("gpu-pcb · precision outline", board_outline, -0.13, 0.13, "pcb", pcb_node, 0.055)
    # Layer/trace accents and mounting holes.
    for i, y in enumerate((-1.55, -1.12, -0.72, 0.76, 1.16, 1.55)):
        box(f"gpu-pcb · routed trace {i+1:02d}", (7.3 - i * 0.35, 0.018, 0.014), (-0.15, y, 0.145), "gold", pcb_node, 0)
    for i, (x, y) in enumerate(((-4.4, 1.45), (4.45, 1.48), (-4.25, -1.48), (4.35, -1.18), (1.85, 0.5))):
        cyl(f"gpu-pcb · plated mounting hole {i+1}", 0.12, 0.03, (x, y, 0.16), "gold", pcb_node, vertices=32, bevel=0)
        cyl(f"gpu-pcb · hole opening {i+1}", 0.055, 0.04, (x, y, 0.18), "black", pcb_node, vertices=24, bevel=0)
    # PCIe edge fingers: segmented contacts with a key gap.
    for i in range(46):
        x = -4.35 + i * 0.19
        if 22 <= i <= 24:
            continue
        box(f"gpu-pcb · PCIe gold finger {i+1:02d}", (0.13, 0.54, 0.035), (x, -2.13, 0.02), "gold", pcb_node, 0.008)
    # GPU package with separate substrate and architecture-only die.
    box("gpu-package · substrate", (1.55, 1.5, 0.14), (0.0, 0.12, 0.29), "ceramic", substrate, 0.055)
    for i in range(10):
        for j in range(8):
            cyl(f"gpu-substrate · solder {i:02d}-{j:02d}", 0.022, 0.045, (-0.62 + i * 0.14, -0.4 + j * 0.115, 0.38), "silver", substrate, vertices=12, bevel=0)
    box("gpu-die · architecture schematic", (0.92, 0.78, 0.12), (0, 0.12, 0.42), "silicon", die, 0.035)
    for i in range(12):
        box(f"gpu-die · region {i+1:02d}", (0.14, 0.14, 0.018), (-0.3 + (i % 4) * 0.2, -0.23 + (i // 4) * 0.23, 0.49), "gold" if i % 3 == 0 else "pcb_edge", die, 0.01)
    # VRAM packages around the die: independent instances, not a separate fake board.
    for i, (x, y) in enumerate(((-1.35, 0.84), (1.35, 0.84), (-1.35, -0.62), (1.35, -0.62), (0.0, 1.1), (0.0, -0.9))):
        p = node(f"gpu-vram-instance-{i+1:02d}", vram)
        box(f"gpu-vram · package {i+1:02d}", (0.72, 0.52, 0.12), (x, y, 0.3), "black", p, 0.035)
        box(f"gpu-vram · die label {i+1:02d}", (0.42, 0.25, 0.018), (x, y, 0.37), "silicon", p, 0.012)
        for sx in (-0.28, 0.28):
            for sy in (-0.18, 0.18):
                cyl(f"gpu-vram · solder {i+1:02d}-{sx}-{sy}", 0.018, 0.04, (x + sx, y + sy, 0.24), "silver", p, vertices=12, bevel=0)
    # VRM components in a meaningful row by the power inlet.
    for i, x in enumerate((2.72, 3.12, 3.52, 3.92, 4.32)):
        p = node(f"gpu-vrm-phase-{i+1:02d}", vrm)
        box(f"gpu-vrm · inductor {i+1:02d}", (0.28, 0.42, 0.28), (x, 1.12, 0.36), "copper", p, 0.035)
        box(f"gpu-vrm · MOSFET {i+1:02d}", (0.24, 0.3, 0.18), (x, 0.66, 0.33), "black", p, 0.02)
        cyl(f"gpu-vrm · capacitor {i+1:02d}", 0.10, 0.25, (x, 0.24, 0.34), "ceramic", p, vertices=24, bevel=0.02)
    # Cooler: real shroud sections, grille pillars, fins and continuous heat pipes.
    box("gpu-cooler · left shroud", (4.75, 1.92, 0.2), (-2.65, 0.08, 0.55), "plastic", cooler, 0.11)
    box("gpu-cooler · right shroud", (4.75, 1.92, 0.2), (2.65, 0.08, 0.55), "plastic", cooler, 0.11)
    box("gpu-cooler · center bridge", (0.72, 1.92, 0.2), (0, 0.08, 0.55), "plastic", cooler, 0.08)
    for x in (-4.72, 4.72):
        box(f"gpu-cooler · end rail {x}", (0.22, 1.9, 0.34), (x, 0.08, 0.6), "aluminum", cooler, 0.04)
    for i in range(28):
        y = -1.25 + i * 0.095
        box(f"gpu-cooler · fin {i+1:02d}", (8.8, 0.055, 0.7), (0, y, 0.66), "aluminum", cooler, 0.012)
    curve_pipe("gpu-cooler · continuous heat pipe A", [(-4.1, -0.55, 0.98), (-2.4, -0.6, 1.12), (0.0, -0.6, 1.2), (2.4, -0.6, 1.12), (4.1, -0.55, 0.98)], 0.09, cooler)
    curve_pipe("gpu-cooler · continuous heat pipe B", [(-4.1, 0.35, 0.98), (-2.4, 0.40, 1.12), (0.0, 0.40, 1.2), (2.4, 0.40, 1.12), (4.1, 0.35, 0.98)], 0.09, cooler)
    fan_assembly(cooler, (-2.55, 0.08, 0.86), "gpu-fan-01")
    fan_assembly(cooler, (2.55, 0.08, 0.86), "gpu-fan-02")
    # Bottom contact base, backplate and visible fasteners.
    box("gpu-cooler · copper contact base", (3.0, 1.8, 0.12), (0, 0.08, 0.38), "copper", cooler, 0.035)
    polygon_prism("gpu-backplate · shaped plate", board_outline, -0.42, -0.27, "aluminum", back, 0.05)
    for i, (x, y) in enumerate(((-4.4, 1.45), (4.45, 1.48), (-4.25, -1.48), (4.35, -1.18), (1.85, 0.5))):
        screw(f"gpu-backplate · screw {i+1}", (x, y, -0.5), back)
    # Rear bracket, port cutout-like frames, and ventilation slots.
    box("gpu-ports · I/O bracket", (0.16, 3.4, 1.32), (5.18, 0.02, 0.15), "silver", ports, 0.025)
    for i, y in enumerate((1.1, 0.38, -0.36, -1.08)):
        box(f"gpu-ports · port opening {i+1}", (0.04, 0.44, 0.55 if i != 1 else 0.3), (5.28, y, 0.15), "black", ports, 0.02)
        box(f"gpu-ports · port surround {i+1}", (0.06, 0.52, 0.65 if i != 1 else 0.4), (5.25, y, 0.15), "gold" if i == 1 else "plastic_dark", ports, 0.018)
    for i in range(10):
        box(f"gpu-ports · bracket vent {i+1:02d}", (0.05, 0.04, 0.12), (5.29, -1.62 + i * 0.16, 0.15), "black", ports, 0)
    # Labels are geometry-backed, not used as a substitute for openings.
    box("gpu · neutral teaching label", (1.1, 0.06, 0.02), (-3.0, 1.76, 0.77), "silver", gpu, 0.01)
    return gpu

def add_studio():
    bpy.ops.object.camera_add(location=(12.8, -12.8, 10.0))
    cam = bpy.context.object
    cam.name = "Preview Camera · front three-quarter"
    bpy.context.scene.camera = cam
    def look_at(obj, target=(0, 0, 0.2)):
        obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()
    look_at(cam)
    cam.data.lens = 58
    bpy.ops.object.light_add(type="AREA", location=(2, -4, 12)); key = bpy.context.object; key.name = "Studio key"; key.data.energy = 950; key.data.shape = "DISK"; key.data.size = 7
    look_at(key, (0, 0, 0))
    bpy.ops.object.light_add(type="AREA", location=(-10, -2, 5)); fill = bpy.context.object; fill.name = "Studio fill"; fill.data.energy = 650; fill.data.size = 8; look_at(fill, (0, 0, 0))
    bpy.ops.object.light_add(type="AREA", location=(4, 8, 4)); rim = bpy.context.object; rim.name = "Studio rim"; rim.data.energy = 800; rim.data.size = 5; look_at(rim, (1, 0, 0))
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -0.72)); floor = bpy.context.object; floor.name = "Neutral white studio floor"; finish(floor, "silver", None, 0)
    floor.data.materials[0].node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.88

def export_assets(gpu):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1000; scene.render.resolution_y = 760; scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = os.path.join(PREVIEWS, "graphics-card-front-three-quarter.png")
    bpy.ops.render.render(write_still=True)
    # Rear evidence frame.
    cam = bpy.data.objects.get("Preview Camera · front three-quarter")
    cam.location = (-12.8, 12.8, 8.8)
    cam.rotation_euler = (Vector((0, 0, -0.05)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(PREVIEWS, "graphics-card-back-three-quarter.png")
    bpy.ops.render.render(write_still=True)
    # Restore front camera for opening the .blend.
    cam.location = (12.8, -12.8, 10.0); cam.rotation_euler = (Vector((0, 0, 0.2)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(PREVIEWS, "graphics-card-front-three-quarter.png")
    blend = os.path.join(SOURCE, "graphics-card.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend)
    # Export all model objects and empties with stable node names.
    model_objects = []
    for candidate in bpy.data.objects:
        parent = candidate
        while parent:
            if parent == gpu:
                model_objects.append(candidate)
                break
            parent = parent.parent
    # Save the editable scene with its studio, then export a clean model-only GLB.
    for candidate in list(bpy.data.objects):
        if candidate not in model_objects:
            bpy.data.objects.remove(candidate, do_unlink=True)
    for o in bpy.context.selected_objects: o.select_set(False)
    for o in model_objects: o.select_set(True)
    gpu.select_set(True); bpy.context.view_layer.objects.active = gpu
    glb = os.path.join(PUBLIC, "graphics-card.glb")
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", use_selection=True, export_apply=False, export_animations=False, export_cameras=False, export_lights=False)
    mesh_objects = [o for o in model_objects if o.type == "MESH"]
    triangles = sum(len(p.vertices) - 2 for o in mesh_objects for p in o.data.polygons)
    manifest = {
        "assetVersion": "gpu-quality-sample-1",
        "software": {"name": "Blender", "version": bpy.app.version_string, "source": "https://www.blender.org/download/"},
        "model": {"id": "graphics-card", "role": "quality sample", "scale": "1 Blender unit = 10 cm teaching scale", "dimensions": [10.5, 4.1, 1.45]},
        "assets": {"blend": "artifacts/hardware-modeling/source/graphics-card.blend", "glb": "models/hardware/graphics-card.glb", "previews": ["artifacts/hardware-modeling/previews/graphics-card-front-three-quarter.png", "artifacts/hardware-modeling/previews/graphics-card-back-three-quarter.png"]},
        "metrics": {"meshObjects": len(mesh_objects), "triangles": triangles, "drawCallHint": "shared materials, separated learnable objects", "glbBytes": os.path.getsize(glb)},
        "nodes": [{"nodeId": key, "objectName": value.name, "parentNodeId": value.parent.name if value.parent and value.parent.name in NODES else None} for key, value in NODES.items()],
        "simplifications": ["Unbranded teaching construction based on generic dual-fan PCIe graphics-card proportions.", "GPU die and VRAM die regions are architecture/package schematics, not microscopic replicas.", "Solder and screw geometry is visible and separable for learning, not an instruction to desolder components."],
    }
    with open(os.path.join(PUBLIC, "graphics-card.manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
    return blend, glb

def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for c in list(bpy.data.collections):
        if c.name != "Collection": bpy.data.collections.remove(c)
    gpu = build_gpu()
    add_studio()
    blend, glb = export_assets(gpu)
    print("LUNA_GPU_BUILD_COMPLETE", blend, glb, len(bpy.data.objects))

if __name__ == "__main__":
    main()
