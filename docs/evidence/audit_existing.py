"""Read-only planning audit; does not save or mutate the source Blender file."""
import bpy, json, hashlib, struct
from pathlib import Path
from mathutils import Vector

SITE = Path(__file__).resolve().parents[2]
ASSET = SITE.parent / 'gpu_5060ti_ultra_w'
SOURCE = ASSET / 'output/s11_lookdev/model.blend'
GLB = ASSET / 'output/s11_lookdev/web/gpu_5060ti_ultra_w.glb'
assert Path(bpy.data.filepath).resolve() == SOURCE.resolve()
bpy.context.view_layer.update()
deps = bpy.context.evaluated_depsgraph_get()
rows = []
for obj in sorted(bpy.data.objects, key=lambda item: item.name):
    if obj.type not in {'MESH', 'CURVE', 'FONT', 'EMPTY'} or obj.name.startswith('S11_') or obj.name == 'PRESENTATION_Ground':
        continue
    evaluated = obj.evaluated_get(deps)
    corners = [evaluated.matrix_world @ Vector(p) for p in evaluated.bound_box] if obj.type != 'EMPTY' else []
    rows.append(dict(name=obj.name, type=obj.type, parent=obj.parent.name if obj.parent else None,
        data=obj.data.name if obj.data else None, hide_render=obj.hide_render,
        matrix_world=[list(row) for row in obj.matrix_world], determinant=obj.matrix_world.to_3x3().determinant(),
        bounds_min=[min(p[i] for p in corners) for i in range(3)] if corners else None,
        bounds_max=[max(p[i] for p in corners) for i in range(3)] if corners else None,
        materials=[slot.material.name if slot.material else None for slot in obj.material_slots],
        modifiers=[{'name':m.name,'type':m.type} for m in obj.modifiers]))
raw = GLB.read_bytes()
length = struct.unpack_from('<I', raw, 12)[0]
gltf = json.loads(raw[20:20+length])
def triangles(mesh):
    return sum(gltf['accessors'][p['indices']]['count']//3 for p in mesh['primitives'] if p.get('mode',4)==4)
summary = dict(audit_date='2026-10-08', blender_version=bpy.app.version_string,
    source=str(SOURCE), source_sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    glb=str(GLB), glb_sha256=hashlib.sha256(raw).hexdigest(), glb_bytes=len(raw),
    model_objects=len(rows), render_visible=sum(r['type']!='EMPTY' and not r['hide_render'] for r in rows),
    glb_nodes=len(gltf['nodes']), glb_meshes=len(gltf['meshes']), glb_materials=len(gltf['materials']),
    glb_textures=len(gltf.get('textures',[])), glb_parent_edges=sum(len(n.get('children',[])) for n in gltf['nodes']),
    triangles_unique=sum(triangles(m) for m in gltf['meshes']),
    triangles_instanced=sum(triangles(gltf['meshes'][n['mesh']]) for n in gltf['nodes'] if 'mesh' in n),
    primitive_draws=sum(len(gltf['meshes'][n['mesh']]['primitives']) for n in gltf['nodes'] if 'mesh' in n),
    glb_extensions=gltf.get('extensionsUsed',[]), objects=rows,
    glb_nodes_raw=gltf['nodes'])
(SITE/'docs/evidence/model_audit.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in summary.items() if k not in {'objects','glb_nodes_raw'}},ensure_ascii=False))
