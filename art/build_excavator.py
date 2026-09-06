"""Original Trenchcraft mini excavator. Blender 5: --background --python art/build_excavator.py"""
import bpy, math, os
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
def mat(name,color,metal=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.48
    return m
yellow=mat('Marigold enamel',(.98,.59,.12),.15);cream=mat('Warm porcelain',(.93,.90,.73));dark=mat('Deep forest steel',(.065,.16,.14),.35);rubber=mat('Rubber',(.055,.075,.07));steel=mat('Hydraulic chrome',(.55,.64,.61),.75);skin=mat('Operator',(.72,.45,.26));blue=mat('Work jacket',(.15,.32,.37));soil=mat('Bucket earth',(.4,.22,.10))
def group(name,loc=(0,0,0),parent=None):
    ob=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(ob);ob.parent=parent;ob.location=loc;return ob
root=group('Excavator');upper=group('Upper',(0,0,0),root)
boom=group('Boom',(0,.35,1.25),upper);stick=group('Stick',(0,2.8,0),boom);bucket=group('Bucket',(0,2.3,0),stick)
def finish(ob,name,material,parent,bevel=0):
    ob.name=name;ob.parent=parent;ob.data.materials.append(material)
    if bevel:
        mod=ob.modifiers.new('Soft edges','BEVEL');mod.width=bevel;mod.segments=2
        ob.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return ob
def box(name,loc,size,material,parent=root,bevel=.035):
    bpy.ops.mesh.primitive_cube_add(size=1);ob=bpy.context.object;ob.location=loc;ob.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(ob,name,material,parent,bevel)
def cyl(name,loc,radius,depth,material,parent=root,rot=(0,0,0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=radius,depth=depth);ob=bpy.context.object;ob.location=loc;ob.rotation_euler=rot;return finish(ob,name,material,parent,.015)
def bar(name,a,b,r,material,parent):
    d=Vector(b)-Vector(a);o=cyl(name,(Vector(a)+Vector(b))/2,r,d.length,material,parent);o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return o
def profile_x(name,points,width,material,parent,bevel=.025):
    n=len(points);verts=[(x,y,z) for x in [-width/2,width/2] for y,z in points]
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    ob=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(ob);return finish(ob,name,material,parent,bevel)
def hose(name,points,parent,r=.022):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.bevel_depth=r;curve.bevel_resolution=1
    spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
    for p,co in zip(spline.bezier_points,points):p.co=co;p.handle_left_type=p.handle_right_type='AUTO'
    ob=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(ob);ob.parent=parent;ob.data.materials.append(rubber)
    bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.convert(target='MESH')
    return bpy.context.object

# U17 photographs: narrow, low track frames beneath a taller open operator station.
box('Undercarriage',(0,0,.38),(1.4,1.75,.40),dark)
for x in [-.79,.79]:
    box('Rubber belt',(x,0,.34),(.39,2.16,.58),rubber,bevel=.20)
    for y,r in [(-.78,.25),(-.38,.17),(0,.17),(.38,.17),(.78,.25)]:
        cyl('Track wheel',(x+(.205 if x>0 else -.205),y,.34),r,.05,dark,rot=(0,math.pi/2,0))
        cyl('Wheel hub',(x+(.235 if x>0 else -.235),y,.34),r*.34,.055,steel,rot=(0,math.pi/2,0))
    for y in [-.78,.78]:
        for a in range(8):
            cyl('Sprocket bolt',(x+(.267 if x>0 else -.267),y+math.sin(a*math.pi/4)*.16,.34+math.cos(a*math.pi/4)*.16),.022,.022,steel,rot=(0,math.pi/2,0))
profile_x('Curved dozer blade',[(1.22,.10),(1.31,.10),(1.42,.46),(1.33,.50)],2.0,dark,root)
box('Blade cutting strip',(0,1.28,.11),(2.03,.08,.09),steel)
for x in [-.52,.52]:bar('Blade push arm',(x,.35,.30),(x,1.30,.30),.095,dark,root)
bar('Blade lift cylinder',(0,.3,.46),(0,1.1,.32),.08,steel,root)
cyl('Slew ring',(0,0,.79),.7,.22,dark)
box('Upper deck',(0,-.06,.98),(1.7,1.95,.28),dark,upper,.19)
box('Rounded counterweight',(0,-.61,1.23),(1.73,1.12,.50),yellow,upper,.25)
box('Engine cover',(0,-.59,1.53),(1.43,.94,.43),yellow,upper,.18)
box('Rear grille',(0,-1.082,1.49),(1.10,.035,.28),dark,upper,.06)
for z in [1.40,1.47,1.54]:box('Grille slat',(0,-1.105,z),(.94,.025,.022),rubber,upper,.004)
box('Rear accent stripe',(0,-1.18,1.17),(1.05,.028,.09),cream,upper,.02)
for x in [-.72,.72]:
    box('Side service panel',(x,-.52,1.38),(.05,.65,.28),dark,upper,.04)
    box('Latch',(x*1.025,-.26,1.42),(.035,.07,.06),steel,upper,.008)
    box('Step',(x,.43,.91),(.29,.47,.08),dark,upper,.02)
    for y in [.28,.39,.50,.61]:box('Step grip',(x,y,.958),(.25,.025,.012),steel,upper,.003)
interior=group('Interior',parent=upper)
box('Seat base',(-.24,-.20,1.43),(.54,.58,.17),rubber,interior,.08)
box('Seat back',(-.24,-.46,1.72),(.54,.13,.55),rubber,interior,.09)
box('Floor',(0,.26,1.12),(1.3,.85,.09),dark,upper)
for x in [-.67,.67]:
    bar('Rear ROPS post',(x,-.75,1.1),(x,-.58,2.66),.06,dark,upper)
    bar('ROPS roof rail',(x,-.58,2.66),(x,.49,2.70),.05,dark,upper)
    bar('Front canopy post',(x,.53,1.15),(x,.49,2.70),.035,dark,upper)
box('Canopy',(0,-.04,2.77),(1.56,1.43,.14),cream,upper,.09)
box('Canopy underside',(0,-.04,2.69),(1.38,1.23,.05),dark,upper,.06)
for x in [-.53,.53]:box('Work lamp',(x,.68,2.69),(.18,.09,.11),steel,upper,.02)
cyl('Beacon base',(.57,-.5,2.88),.075,.08,dark,upper)
cyl('Amber beacon',(.57,-.5,2.98),.075,.15,yellow,upper)
for x in [-.59,.11]:
    box('Arm rest',(x,-.08,1.65),(.15,.42,.11),rubber,interior)
    bar('Joystick',(x,.08,1.67),(x,.14,1.85),.026,steel,interior)
    box('Joystick grip',(x,.14,1.85),(.07,.08,.12),rubber,interior)
    bar('Sleeve',(x,-.20,1.95),(x,-.04,1.78),.07,blue,interior)
    bar('Forearm',(x,-.04,1.78),(x,.14,1.84),.05,skin,interior)
box('Jacket',(-.24,-.20,1.81),(.40,.32,.46),blue,interior,.1)
cyl('Head',(-.24,-.16,2.17),.14,.25,skin,interior)
cyl('Hard hat',(-.24,-.16,2.31),.18,.10,yellow,interior)
for x in [-.40,-.08]:
    bar('Trouser thigh',(x,-.10,1.50),(x,.27,1.42),.09,blue,interior)
    bar('Trouser shin',(x,.27,1.42),(x,.36,1.20),.075,blue,interior)
    box('Boot',(x,.43,1.20),(.16,.29,.13),rubber,interior)
    bar('Travel lever',(x,.53,1.20),(x,.49,1.55),.02,steel,interior)
    box('Travel grip',(x,.49,1.56),(.09,.06,.06),rubber,interior)
# Authored at zero joint angles so runtime joints match the domain kinematics exactly.
profile_x('Tapered gooseneck boom',[(0,-.17),(.85,.25),(1.25,.5),(1.55,.52),(2.68,-.11),(2.90,-.1),(2.90,.13),(1.65,.92),(1.24,.98),(.65,.60),(-.16,.17)],.32,yellow,boom,.055)
profile_x('Boom side inset',[(.92,.47),(1.30,.69),(1.56,.7),(2.31,.30),(2.35,.38),(1.57,.83),(1.30,.86)],.338,dark,boom,.008)
profile_x('Tapered dipper',[(-.13,-.13),(.28,-.20),(1.9,-.11),(2.36,-.10),(2.37,.12),(1.85,.17),(.22,.28),(-.12,.19)],.255,yellow,stick,.035)
for x in [-.19,.19]:
    hose('Boom hydraulic hose',[(x,.1,.23),(x,.70,.67),(x,1.30,1.025),(x,1.62,.98),(x,2.45,.46),(x,2.75,.23)],boom,.018)
    hose('Dipper auxiliary hose',[(x,.12,.22),(x,.55,.25),(x,1.3,.22),(x,1.95,.20)],stick,.018)
for y,z in [(.73,.70),(1.4,1.00),(2.3,.51)]:box('Hose retaining clip',(0,y,z),(.43,.065,.038),steel,boom,.008)
for y in [.6,1.3,1.9]:box('Dipper hose clip',(0,y,.24),(.40,.055,.03),steel,stick,.005)
for x in [-.23,.23]:box('Boom foot cheek',(x,.35,1.27),(.12,.40,.45),dark,upper,.06)
box('Bucket linkage base',(0,1.97,.17),(.40,.22,.16),yellow,stick,.025)
cyl('Rocker base pin',(0,1.97,.20),.065,.54,steel,stick,(0,math.pi/2,0))
for parent in [boom,stick,bucket]:cyl('Pivot pin',(0,0,0),.13,.60,steel,parent,(0,math.pi/2,0))
# Thick scoop floor, closed side cheeks, and four separate cutting teeth.
# A backhoe scoop opens toward the operator (-Y), not away like a loader.
profile=[(.14,.08),(.16,-.18),(-.06,-.44),(-.36,-.51),(-.70,-.35)]
for (ay,az),(by,bz) in zip(profile,profile[1:]):
    o=box('Curved bucket shell',(0,(ay+by)/2,(az+bz)/2),(.76,math.hypot(by-ay,bz-az)+.035,.065),dark,bucket,.015);o.rotation_euler.x=math.atan2(bz-az,by-ay)
for x in [-.39,.39]:
    count=len(profile);verts=[(x-.028,y,z) for y,z in profile]+[(x+.028,y,z) for y,z in profile]
    faces=[tuple(range(count-1,-1,-1)),tuple(range(count,count*2))]+[(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)]
    mesh=bpy.data.meshes.new('Scoop side');mesh.from_pydata(verts,[],faces);mesh.update();ob=bpy.data.objects.new('Bucket cheek',mesh);bpy.context.collection.objects.link(ob);finish(ob,'Bucket cheek',dark,bucket,.012)
for x in [-.27,-.09,.09,.27]:box('Cutting tooth',(x,-.67,-.35),(.11,.25,.075),steel,bucket,.01)
for x in [-.19,.19]:box('Coupler ear',(x,0,.12),(.09,.35,.20),steel,bucket,.025)
cyl('Bucket linkage pin',(0,.16,.22),.065,.54,steel,bucket,(0,math.pi/2,0))
group('BucketFill',(0,-.27,-.32),bucket)
# Dynamic hydraulics in the view connect moving pivot anchors.
# Bake bevels, then join compatible objects under each pivot to keep draw calls bounded.
for parent in [root,upper,interior,boom,stick,bucket]:
    meshes=[o for o in list(bpy.context.scene.objects) if o.type=='MESH' and o.parent==parent and o.name!='BucketFill']
    for ob in meshes:
        bpy.context.view_layer.objects.active=ob
        for mod in list(ob.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
    if meshes:
        bpy.ops.object.select_all(action='DESELECT')
        for ob in meshes:ob.select_set(True)
        bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();meshes[0].name=parent.name+'Shell'
os.makedirs(os.path.join(ROOT,'public','models'),exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT,'public','models','mini-excavator.glb'),export_format='GLB',export_apply=True)
boom.rotation_euler.x=.58;stick.rotation_euler.x=-1.5;bucket.rotation_euler.x=math.pi/2-.15
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'art','mini-excavator.blend'))
print('TRENCHCRAFT ASSET COMPLETE')
