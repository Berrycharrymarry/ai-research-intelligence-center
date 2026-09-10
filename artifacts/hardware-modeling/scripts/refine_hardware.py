"""Blender production pass. Reuses editable sources; exports semantic GLBs."""
import bpy, math, json, sys, argparse, hashlib
from pathlib import Path
from mathutils import Vector
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('--root', required=True)
parser.add_argument('--asset', choices=['gpu','cpu'], default='gpu')
parser.add_argument('--render', choices=['none','draft','all'], default='all')
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
ROOT = Path(args.root); OUT = ROOT/'artifacts/hardware-modeling'
for folder in ('source','renders','textures','reports'): (OUT/folder).mkdir(parents=True, exist_ok=True)
asset_name = 'graphics-card' if args.asset == 'gpu' else 'cpu-package'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'source'/f'{asset_name}.blend'))
root = bpy.data.objects[args.asset]

def descendants(obj): return [obj, *obj.children_recursive]
def remove(obj):
    for child in list(obj.children): remove(child)
    bpy.data.objects.remove(obj, do_unlink=True)
def material(name, color, metal=0, rough=.4):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    b=m.node_tree.nodes.get('Principled BSDF'); b.inputs['Base Color'].default_value=(*color,1)
    b.inputs['Metallic'].default_value=metal; b.inputs['Roughness'].default_value=rough
    return m
M={
 'graphite':material('Satin graphite polymer',(.025,.032,.04),.1,.32),
 'black':material('Fan glass-filled polymer',(.012,.016,.022),0,.38),
 'silver':material('Satin machined aluminum',(.5,.55,.6),.85,.29),
 'copper':material('Copper heat transfer',(.55,.22,.085),.9,.24),
 'gold':material('Gold plated contact',(.65,.4,.09),.85,.24),
 'ink':material('Light grey silkscreen',(.53,.58,.59),0,.72),
 'green':material('Package substrate',(.023,.12,.075),.05,.44),
 'silicon':material('Polished silicon',(.12,.17,.2),.7,.17),
}
def empty(name,parent):
    o=bpy.data.objects.new(name,None); bpy.context.scene.collection.objects.link(o); o.parent=parent; o['nodeId']=name; return o
def finish(o,name,mat,parent,bevel=0):
    o.name=name; o.parent=parent; o.data.materials.clear(); o.data.materials.append(M[mat] if isinstance(mat,str) else mat)
    if bevel:
        b=o.modifiers.new('Manufactured edge','BEVEL'); b.width=bevel; b.segments=3
        n=o.modifiers.new('Face-weighted normals','WEIGHTED_NORMAL'); n.keep_sharp=True
    return o
def box(name,size,loc,mat,parent,bevel=.015):
    bpy.ops.mesh.primitive_cube_add(location=loc); o=bpy.context.object; o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,mat,parent,bevel)
def cylinder(name,radius,depth,loc,mat,parent,vertices=48,bevel=.012):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc)
    return finish(bpy.context.object,name,mat,parent,bevel)
def cut(obj,cutter):
    bpy.context.view_layer.objects.active=obj
    m=obj.modifiers.new('Through opening','BOOLEAN'); m.operation='DIFFERENCE'; m.object=cutter
    bpy.ops.object.modifier_apply(modifier=m.name); remove(cutter)
def ring(name,r,thick,depth,loc,mat,parent):
    o=cylinder(name,r,depth,loc,mat,parent,96,0)
    c=cylinder('cutter',r-thick,depth+.2,loc,mat,parent,96,0); cut(o,c)
    b=o.modifiers.new('Ring edge','BEVEL'); b.width=.008; b.segments=2
    for p in o.data.polygons: p.use_smooth = len(p.vertices)==4
    return o
def pipe(name,points,r,parent,mat='copper'):
    c=bpy.data.curves.new(name,'CURVE'); c.dimensions='3D'; c.resolution_u=12; c.bevel_depth=r; c.bevel_resolution=3
    s=c.splines.new('BEZIER'); s.bezier_points.add(len(points)-1)
    for b,co in zip(s.bezier_points,points): b.co=co; b.handle_left_type='AUTO'; b.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c); bpy.context.scene.collection.objects.link(o); o.parent=parent; o.data.materials.append(M[mat]); return o
def label(body,loc,size,parent,mat='ink',rot=(0,0,0)):
    c=bpy.data.curves.new('Laser marking','FONT'); c.body=body; c.size=size; c.extrude=0; c.align_x='CENTER'
    o=bpy.data.objects.new('Mark '+body,c); bpy.context.scene.collection.objects.link(o); o.location=loc; o.rotation_euler=rot; o.parent=parent; o.data.materials.append(M[mat]); return o
def screw(loc,parent):
    o=cylinder('M2 screw head',.085,.045,loc,'graphite',parent,24,.009)
    for size in ((.1,.019,.05),(.019,.1,.05)):
        cut(o,box('slot',size,(loc[0],loc[1],loc[2]+.025),'black',parent,0))
    return o

def make_pcb_texture(board):
    # Original 2K UV texture: routed traces and pads, decorative teaching routing.
    n=2048; a=np.zeros((n,n,4),dtype=np.float32); a[:,:,:]=(.019,.061,.046,1)
    rng=np.random.default_rng(14); a[:,:,:3] += rng.uniform(-.003,.003,(n,n,1)).astype(np.float32)
    def point(x,y): return int((x+5.4)/10.8*(n-1)),int((y+2.5)/5*(n-1))
    def line(coords,col,width=2):
        for p,q in zip(coords,coords[1:]):
            x0,y0=point(*p); x1,y1=point(*q); num=max(abs(x1-x0),abs(y1-y0),1)+1
            xs=np.linspace(x0,x1,num).astype(int); ys=np.linspace(y0,y1,num).astype(int)
            for dx in range(-width,width+1):
                for dy in range(-width,width+1): a[np.clip(ys+dy,0,n-1),np.clip(xs+dx,0,n-1),:3]=col
    for side in (-1,1):
        for k in range(30):
            x=.85+k*.046; y=.5+k*.033
            line([(side*.7,k*.028-.4),(side*x,k*.028-.4),(side*(x+.3),y),(side*(2.1+k*.08),y)],(.045,.115,.085),1)
    for k in range(34):
        x=-4.4+k*.21
        line([(x,-2.1),(x,-1.74),(x+.17,-1.55),(x+.17,-1.35)],(.07,.13,.09),1)
    img=bpy.data.images.new('Original PCB routed UV',width=n,height=n,alpha=True); img.pixels.foreach_set(a.ravel()); img.filepath_raw=str(OUT/'textures/pcb-routing.png'); img.file_format='PNG'; img.save(); img.pack()
    m=material('PCB solder mask / original routed UV',(.035,.11,.065),.12,.48)
    tex=m.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=img; m.node_tree.links.new(tex.outputs['Color'],m.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    board.data.materials.clear(); board.data.materials.append(m)
    uv=board.data.uv_layers.active or board.data.uv_layers.new(name='Board planar UV')
    for face in board.data.polygons:
        for li in face.loop_indices:
            v=board.data.vertices[board.data.loops[li].vertex_index].co
            uv.data[li].uv=((v.x+5.4)/10.8,(v.y+2.5)/5)

def refine_gpu():
    cooler=bpy.data.objects['gpu-cooler']; pcb=bpy.data.objects['gpu-pcb']; back=bpy.data.objects['gpu-backplate']; ports=bpy.data.objects['gpu-ports']
    for assembly in (cooler,back,ports):
        for o in list(assembly.children): remove(o)
    # Preserve source PCB outline, packages and connectors, repair obsolete details.
    for o in list(pcb.children):
        if any(term in o.name for term in ('routed trace','hole opening','plated mounting')): remove(o)
    board=next(o for o in pcb.children if 'precision outline' in o.name); make_pcb_texture(board)
    holes=[(-4.65,1.65),(4.6,1.6),(-4.6,-1.6),(4.6,-1.4),(-.95,.95),(.95,.95),(-.95,-.8),(.95,-.8)]
    for x,y in holes:
        cut(board,cylinder('PCB drill',.065,.6,(x,y,0),'gold',pcb,24,0))
        ring('Plated mounting annulus',.13,.065,.015,(x,y,.148),'gold',pcb)
    for o in list(bpy.data.objects['gpu-substrate'].children):
        if 'solder' in o.name: o.location.z=.20
        elif o.type=='MESH': o.data.materials.clear(); o.data.materials.append(M['green'])
    die=bpy.data.objects['gpu-die']
    for o in list(die.children): remove(o)
    box('Mirror-finished silicon die',(.94,.81,.075),(0,.12,.44),'silicon',die,.009)
    label('GPU',(-.03,.05,.479),.10,die)
    vr=bpy.data.objects['gpu-vram']; vrpkg=bpy.data.objects['gpu-vram-package']
    for o in list(vr.children):
        if o != vrpkg: o.parent=vrpkg
    for o in list(vrpkg.children_recursive):
        if 'die label' in o.name: remove(o)
    for i,(x,y) in enumerate(((-1.35,.84),(1.35,.84),(-1.35,-.62),(1.35,-.62),(0,1.1),(0,-.9))):
        label('GDDR\nMEMORY',(x,y+.04,.368),.058,vrpkg)
    rng=np.random.default_rng(2026)
    for i in range(120):
        x=float(rng.uniform(-4.7,4.6)); y=float(rng.uniform(-1.7,1.7))
        if abs(x)<1.85 or (x>2.5 and y>-.1): continue
        body=box('SMD capacitor',(.12,.058,.053),(x,y,.175),'graphite',pcb,.007)
        for dx in (-.053,.053): box('Solder termination',(.023,.061,.045),(x+dx,y,.17),'silver',pcb,.004)
    label('RESEARCH / GRAPHICS MODULE',(-3.3,1.55,.15),.115,pcb)
    label('REV 02   •   TEACHING PCB',(2.9,-1.48,.15),.09,pcb)
    # Fins sit below the fans, with enough blade clearance.
    fins=empty('gpu-fins',cooler); base=empty('gpu-heat-base',cooler); fans=empty('gpu-fan',cooler)
    box('Copper contact base',(2.3,1.65,.10),(0,.12,.54),'copper',base,.025)
    for bank in (-1,1):
        for i in range(49):
            x=bank*(.7+i*.081)
            box('Folded aluminum fin',(.035,3.45,.70),(x,0,.97),'silver',fins,.004)
    for i in range(4):
        y=-.53+i*.36
        pipe('Bent copper heat pipe', [(-4.63,y,1.06),(-4.25,y,.77),(-1.5,y,.63),(0,y,.60),(1.5,y,.63),(4.25,y,.77),(4.63,y,1.06)],.073,base)
    # Machined shroud with actual openings, not discs over a solid face.
    shell=box('Chamfered dual-fan shroud',(10.65,4.32,.23),(0,0,1.83),'graphite',cooler,.13)
    for cx in (-2.55,2.55): cut(shell,cylinder('Fan aperture',1.79,.7,(cx,0,1.83),'black',cooler,96,0))
    for y in (-2.07,2.07):
        box('Sidewall rail',(10.25,.13,.7),(0,y,1.38),'graphite',cooler,.055)
        box('Satin aluminum edge',(9.75,.025,.045),(0,y*1.035,1.73),'silver',cooler,.015)
    for cx in (-2.55,2.55):
        ring('Beveled fan aperture rim',1.825,.042,.085,(cx,0,1.925),'silver',cooler)
        fan=empty('gpu-fan-left' if cx<0 else 'gpu-fan-right',fans)
        for i in range(11):
            verts=[]; faces=[]; angle=i*math.tau/11
            for j in range(11):
                t=j/10; r=.31+1.36*t
                for k in range(6):
                    u=k/5; theta=angle+.25*t+.37*(u-.5)*(0.6+0.4*t)
                    z=1.70+.12*(u-.5)*(1-.35*t)+.025*math.sin(math.pi*t)
                    verts.append((cx+r*math.cos(theta),r*math.sin(theta),z))
            for j in range(10):
                for k in range(5): a=j*6+k; faces.append((a,a+1,a+7,a+6))
            mesh=bpy.data.meshes.new('Twisted aerodynamic blade'); mesh.from_pydata(verts,[],faces); mesh.update()
            o=bpy.data.objects.new('Swept blade',mesh); bpy.context.scene.collection.objects.link(o); finish(o,o.name,'black',fan)
            for p in mesh.polygons:p.use_smooth=True
            s=o.modifiers.new('Blade wall thickness','SOLIDIFY'); s.thickness=.025
            b=o.modifiers.new('Soft blade edges','BEVEL'); b.width=.008; b.segments=2
        cylinder('Motor hub',.39,.29,(cx,0,1.71),'black',fan,64,.035)
        cylinder('Brushed hub badge',.27,.014,(cx,0,1.863),'silver',fan,64,.006)
        label('R',(cx,-.095,1.873),.24,fan,'graphite')
        for angle in (0,math.tau/3,2*math.tau/3):
            p=box('Motor support spoke',(1.28,.10,.08),(cx+.9*math.cos(angle),.9*math.sin(angle),1.48),'black',fan,.025); p.rotation_euler.z=angle
    for x in (-4.8,0,4.8):
        for y in (-1.93,1.93): screw((x,y,1.96),cooler)
    label('GRAPHICS   /   06',(0,-.10,1.955),.14,cooler)
    # Back plate has a real flow-through vent bank and mounting holes.
    plate=box('Anodized backplate',(10.45,4.02,.11),(0,0,-.33),'graphite',back,.1)
    for i in range(8): cut(plate,box('Airflow slot',(.17,2.65,.4),(3.25+i*.19,0,-.33),'black',back,.07))
    for x,y in holes[:4]:
        cut(plate,cylinder('Backplate hole',.065,.5,(x,y,-.33),'black',back,24,0))
        s=screw((x,y,-.43),back); s.rotation_euler.x=math.pi
    label('RESEARCH  /  DUAL FAN',(-1.3,.2,-.393),.26,back,rot=(math.pi,0,0))
    label('EDUCATIONAL GRAPHICS MODULE',(-1.3,-.25,-.393),.11,back,rot=(math.pi,0,0))
    # Bracket and ports: actual cut apertures and hollow metal receptacles.
    bracket=box('Expansion bracket',(.10,4.18,1.85),(5.35,0,.68),'silver',ports,.025)
    for i,y in enumerate((-1.35,-.45,.45,1.35)):
        cut(bracket,box('Display aperture',(.45,.67,.29),(5.35,y,.6),'black',ports,.035))
        receptacle=box('Display receptacle',(.51,.73,.36),(5.18,y,.6),'silver',ports,.026)
        cut(receptacle,box('Connector cavity',(.7,.60,.24),(5.23,y,.6),'black',ports,.018))
        box('Connector tongue',(.25,.47,.035),(5.22,y,.59),'black',ports,.008)
        for j in range(9): box('Display contact',(.19,.026,.008),(5.25,y-.19+j*.046,.613),'gold',ports,0)
    for i in range(13):cut(bracket,box('Bracket ventilation',(.4,.14,.45),(5.35,-1.75+i*.285,1.30),'black',ports,.065))
    box('Bracket retaining lip',(.43,4.18,.075),(5.5,0,1.635),'silver',ports,.025)
    power=bpy.data.objects['gpu-power-zone']
    connector=box('Eight pin power housing',(1.15,.43,.42),(3.85,1.85,.35),'black',power,.035)
    for i in range(4):
        for j in range(2):
            c=box('Power socket cavity',(.19,.22,.14),(3.43+i*.28,2.04,.23+j*.23),'black',power,.018); cut(connector,c)
    # Stable disassembly directions in Blender coordinates; glTF stores extras.
    dirs={'gpu-cooler':(0,0,3.0),'gpu-backplate':(0,0,-1.6),'gpu-ports':(1.8,0,0),'gpu-package':(0,0,1.25),'gpu-vram':(0,0,.8),'gpu-power-zone':(0,0,.6),'gpu-fan':(0,0,1.7),'gpu-fins':(0,0,.8),'gpu-heat-base':(0,0,-.6),'gpu-die':(0,0,.8),'gpu-substrate':(0,0,-.4),'gpu-vram-package':(0,0,.6)}
    for name,direction in dirs.items():bpy.data.objects[name]['explodeVector']=list(direction)

def refine_cpu():
    lid=bpy.data.objects['cpu-lid']; substrate=bpy.data.objects['cpu-substrate']
    for o in list(lid.children):
        if any(t in o.name for t in ('mark','label','line')):remove(o)
    meshes=[o for o in lid.children_recursive if o.type=='MESH']
    if meshes:
        top=max((o.matrix_world@Vector(c)).z for o in meshes for c in o.bound_box)
        label('RESEARCH', (0,.26,top+.002),.21,lid,'graphite')
        label('CPU  /  LGA PACKAGE', (0,-.04,top+.003),.095,lid,'graphite')
        label('TEACHING SAMPLE  •  02', (0,-.22,top+.004),.063,lid,'graphite')
    for o in substrate.children_recursive:
        if o.type=='MESH' and 'route' in o.name:
            o.data.materials.clear();o.data.materials.append(M['green'])
    for name,v in {'cpu-lid':(0,0,1.3),'cpu-die':(0,0,.7),'cpu-substrate':(0,0,.2),'cpu-contacts':(0,0,-.5)}.items():bpy.data.objects[name]['explodeVector']=list(v)

def optimize():
    # Join only direct meshes of a semantic parent, preserving all learning nodes.
    for parent in [o for o in [root,*root.children_recursive] if o.type == 'EMPTY']:
        if parent.type!='EMPTY':continue
        objects=[o for o in parent.children if o.type in ('MESH','CURVE','FONT')]
        if not objects:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in objects:o.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.convert(target='MESH');bpy.ops.object.join()
        o=bpy.context.object;o.name=parent.name+'-surfaces';o['nodeId']=parent.name
    bpy.context.view_layer.update()

def studio():
    for o in list(bpy.context.scene.objects):
        if o not in descendants(root): remove(o)
    scene=bpy.context.scene; scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
    prefs=bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type='OPTIX';prefs.get_devices()
        for d in prefs.devices:d.use=d.type=='OPTIX'
        scene.cycles.device='GPU'
    except Exception: scene.cycles.device='CPU'
    scene.world=bpy.data.worlds.new('White studio environment');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.78,.81,.85,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
    white=material('Studio matte white',(.84,.84,.84),0,.8)
    floor=box('Studio floor',(200,200,.03),(0,0,-.67 if args.asset=='gpu' else -.5),white,None,0)
    factor=1 if args.asset=='gpu' else .35
    for name,loc,energy,size in [('Key',(-3,-4,9),1800,8),('Fill',(4,3,7),1300,6),('Rim',(-6,4,4),1100,5)]:
        bpy.ops.object.light_add(type='AREA',location=Vector(loc)*factor);o=bpy.context.object;o.name=name;o.data.energy=energy*factor*factor;o.data.shape='DISK';o.data.size=size*factor;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.clip_end=300
    scene.view_settings.view_transform='AgX';scene.render.resolution_x=1600;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG'
    return scene,cam,floor

def render_views(scene,cam,floor):
    if args.render=='none':return
    views=[('front',(10,-12,14),(0,0,.7),13,False),('back',(-9,11,-14),(0,0,-.2),13,True),('ports',(14,-6,7),(2.1,0,.6),8,False),('fan',(-4,-4,8),(-2.55,0,1.65),4.8,False),('exploded',(10,-13,13),(0,0,1.1),14,True),('board',(0,-6,13),(0,0,.1),11.8,False)] if args.asset=='gpu' else [('front',(4,-5,6),(0,0,.2),3.8,False),('contacts',(3,4,-6),(0,0,0),3.8,True),('exploded',(4,-5,6),(0,0,.5),4.4,True)]
    if args.render=='draft':views=views[:1];scene.render.resolution_percentage=60;scene.cycles.samples=20
    saved={o.name:o.location.copy() for o in descendants(root)}
    for name,loc,target,scale,hidefloor in views:
        for o in descendants(root):o.location=saved[o.name];o.hide_render=False
        if name=='exploded':
            for o in root.children_recursive:
                if 'explodeVector' in o and o.parent==root:o.location += Vector(o['explodeVector'])*.7
            if args.asset=='cpu':bpy.data.objects['cpu-lid'].location.z+=1;bpy.data.objects['cpu-die'].location.z+=.4
        if name=='board':bpy.data.objects['gpu-cooler'].hide_render=True
        # Empty hide_render does not recursively hide children.
        if name=='board':
            for o in descendants(bpy.data.objects['gpu-cooler']):o.hide_render=True
        floor.hide_render=hidefloor;cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale
        scene.render.filepath=str(OUT/'renders'/f'{asset_name}-{name}.png');bpy.ops.render.render(write_still=True)
    for o in descendants(root):o.location=saved[o.name];o.hide_render=False
    floor.hide_render=False
    loc,target,scale=views[0][1:4];cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale

if args.asset=='gpu':refine_gpu()
else:refine_cpu()
optimize();scene,cam,floor=studio();render_views(scene,cam,floor)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'source'/f'{asset_name}.blend'))
bpy.ops.object.select_all(action='DESELECT')
for o in descendants(root):o.select_set(True)
bpy.context.view_layer.objects.active=root
public=ROOT/'frontend/public/models/hardware';glb=public/f'{asset_name}.glb'
bpy.ops.export_scene.gltf(filepath=str(glb),export_format='GLB',use_selection=True,export_apply=True,export_animations=False,export_extras=True,export_cameras=False,export_lights=False)
meshes=[o for o in descendants(root) if o.type=='MESH'];triangles=0
for o in meshes:o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
manifest={'assetVersion':'sol-studio-2','software':bpy.app.version_string,'renderEngine':scene.render.engine,'renderDevice':scene.cycles.device,'model':asset_name,'nodes':[o.name for o in descendants(root) if o.type=='EMPTY'],'metrics':{'meshObjects':len(meshes),'triangles':triangles,'glbBytes':glb.stat().st_size},'sha256':hashlib.sha256(glb.read_bytes()).hexdigest(),'source':'Original editable teaching asset; generic hardware, not a branded replica','simplifications':['PCB traces and package interiors are educational representations.','Soldered parts are separated for observation, not physical repair instructions.']}
(public/f'{asset_name}.manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8');print('PRODUCTION_COMPLETE',json.dumps(manifest))

