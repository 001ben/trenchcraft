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
box('Undercarriage',(0,0,.43),(1.7,2.25,.48),dark)
for x in [-.89,.89]:
    box('Rubber belt',(x,0,.4),(.5,2.65,.7),rubber,bevel=.23)
    for y in [-.9,-.45,0,.45,.9]:
        cyl('Track wheel',(x+(.265 if x>0 else -.265),y,.4),.26,.06,dark,rot=(0,math.pi/2,0))
        cyl('Wheel hub',(x+(.305 if x>0 else -.305),y,.4),.09,.08,yellow,rot=(0,math.pi/2,0))
box('Dozer blade',(0,1.4,.23),(2.18,.15,.40),dark)
for x in [-.55,.55]:bar('Blade brace',(x,.45,.35),(x,1.4,.28),.07,steel,root)
cyl('Slew ring',(0,0,.79),.7,.22,dark)
box('Upper deck',(0,0,.98),(1.8,2.0,.30),yellow,upper,.13)
box('Counterweight',(0,-.67,1.26),(1.75,.80,.58),yellow,upper,.16)
box('Rear white panel',(0,-1.085,1.28),(1.4,.045,.33),cream,upper)
for x in [-.58,-.36,-.14,.08,.30,.52]:box('Cooling vent',(x,-1.115,1.28),(.07,.015,.22),dark,upper,.008)
box('Engine lid',(.53,-.25,1.40),(.59,.95,.35),yellow,upper,.1)
interior=group('Interior',parent=upper)
box('Seat base',(-.45,-.3,1.26),(.55,.55,.24),dark,interior,.08)
box('Seat back',(-.45,-.54,1.57),(.55,.12,.55),dark,interior,.08)
box('Floor',(-.45,.22,1.13),(.77,1.1,.09),dark,upper)
for x in [-.88,-.05]:
    for y in [-.61,.53]:bar('Canopy post',(x,y,1.16),(x,y,2.38),.038,dark,upper)
box('Canopy',(-.46,-.03,2.43),(1.10,1.5,.14),cream,upper,.08)
cyl('Amber beacon',(.42,-.64,1.8),.09,.15,yellow,upper)
for x in [-.73,-.13]:
    box('Arm rest',(x,-.08,1.49),(.15,.42,.11),dark,interior)
    bar('Joystick',(x,.08,1.50),(x,.14,1.72),.026,steel,interior)
    box('Joystick grip',(x,.14,1.72),(.07,.08,.12),dark,interior)
box('Jacket',(-.44,-.27,1.65),(.40,.32,.46),blue,interior,.1)
cyl('Head',(-.44,-.23,2.02),.145,.27,skin,interior)
cyl('Hard hat',(-.44,-.23,2.17),.18,.11,yellow,interior)
box('Boots',(-.44,.35,1.23),(.40,.27,.16),dark,interior)
# Authored at zero joint angles so runtime joints match the domain kinematics exactly.
for a,b in zip([(0,0),(.85,.32),(1.75,.28)],[(.85,.32),(1.75,.28),(2.8,0)]):
    o=box('Bent boom',(0,(a[0]+b[0])/2,(a[1]+b[1])/2),(.40,math.hypot(b[0]-a[0],b[1]-a[1])+.10,.38),yellow,boom,.07)
    o.rotation_euler.x=math.atan2(b[1]-a[1],b[0]-a[0])
box('Dipper spar',(0,1.15,0),(.30,2.3,.32),yellow,stick,.07)
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
