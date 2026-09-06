"""Original Trenchcraft mini excavator. Blender 5: --background --python art/build_excavator.py"""
import bpy, math, os
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
def mat(name,color,metal=0,rough=.48):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m
yellow=mat('Construction amber enamel',(.92,.30,.035),.15,.34)
cream=mat('Canopy graphite',(.11,.13,.135),.1,.5)
dark=mat('Powder coated chassis',(.038,.048,.047),.35,.48)
rubber=mat('Track rubber',(.018,.023,.022),0,.95)
steel=mat('Machined steel',(.48,.55,.56),.85,.25)
skin=mat('Operator',(.57,.32,.18),0,.9)
blue=mat('Workwear',(.07,.13,.19),0,.95)
soil=mat('Bucket earth',(.4,.22,.10))
wear=mat('Worn bucket steel',(.16,.18,.17),.65,.62)
light=mat('Lamp lens',(.85,.91,.85),.15,.2)

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
    bpy.ops.mesh.primitive_cylinder_add(vertices=20,radius=radius,depth=depth);ob=bpy.context.object;ob.location=loc;ob.rotation_euler=rot;return finish(ob,name,material,parent,.015)
def bar(name,a,b,r,material,parent):
    d=Vector(b)-Vector(a);o=cyl(name,(Vector(a)+Vector(b))/2,r,d.length,material,parent);o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return o
def profile_x(name,points,width,material,parent,bevel=.025):
    n=len(points);verts=[(x,y,z) for x in [-width/2,width/2] for y,z in points]
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    ob=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(ob);return finish(ob,name,material,parent,bevel)
def hose(name,points,parent,r=.022):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.bevel_depth=r;curve.bevel_resolution=1;curve.resolution_u=6
    spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
    for p,co in zip(spline.bezier_points,points):p.co=co;p.handle_left_type=p.handle_right_type='AUTO'
    ob=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(ob);ob.parent=parent;ob.data.materials.append(rubber)
    bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.convert(target='MESH')
    return bpy.context.object

def ellipsoid(name,loc,size,material,parent):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=10,radius=1)
    ob=bpy.context.object;ob.location=loc;ob.scale=size
    for face in ob.data.polygons:face.use_smooth=True
    return finish(ob,name,material,parent)

def panel(name,outline,bottom,top,material,parent,bevel=.04):
    # A shaped plan view, extruded vertically; panels are not stacked rounded cubes.
    n=len(outline);verts=[(x,y,z) for z in [bottom,top] for x,y in outline]
    faces=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    ob=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(ob)
    return finish(ob,name,material,parent,bevel)

def decal(name,text,loc,size,parent,rotation=(math.pi/2,0,math.pi/2)):
    curve=bpy.data.curves.new(name,'FONT');curve.body=text;curve.size=size;curve.extrude=0;curve.align_x='CENTER'
    ob=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(ob);ob.parent=parent;ob.location=loc;ob.rotation_euler=rotation
    ob.data.materials.append(light)
    bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.convert(target='MESH')

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
outline=[(-.83,.81),(.83,.81),(.86,-.44),(.79,-.77),(.57,-1.03),(.28,-1.15),(-.28,-1.15),(-.57,-1.03),(-.79,-.77),(-.86,-.44)]
outline.reverse()
panel('Shaped upper frame',outline,.86,1.09,dark,upper,.06)
rear=[(-.79,-.30),(-.79,-.66),(-.62,-.92),(-.30,-1.10),(.30,-1.10),(.62,-.92),(.79,-.66),(.79,-.30)]
panel('Cast counterweight',rear,1.09,1.43,yellow,upper,.075)
panel('Bonnet',[(x*.90,y*.92) for x,y in rear],1.46,1.70,yellow,upper,.09)
box('Rear grille',(0,-1.048,1.58),(.66,.025,.18),dark,upper,.022)
for z in [1.53,1.58,1.63]:box('Grille slat',(0,-1.066,z),(.59,.015,.012),rubber,upper,.002)
box('Counterweight rub rail',(0,-1.125,1.15),(.64,.035,.07),rubber,upper,.02)
for x in [-.78,.78]:
    box('Panel seam',(x,-.46,1.47),(.02,.31,.018),rubber,upper,.002)
    box('Side grille',(x,-.52,1.58),(.023,.29,.14),dark,upper,.012)
    for y in [-.64,-.58,-.52,-.46,-.40]:box('Cooling louvre',(x*1.018,y,1.58),(.012,.018,.10),rubber,upper,.002)
    box('Panel latch',(x,-.22,1.59),(.025,.058,.036),steel,upper,.007)
    box('Access step',(x,.43,.91),(.27,.47,.07),dark,upper,.012)
    for y in [.28,.39,.50,.61]:box('Step grip',(x,y,.955),(.23,.026,.013),rubber,upper,.002)
    bar('Operator grab rail',(x,.46,1.16),(x,.52,1.70),.024,dark,upper)
    cyl('Deck bolt',(x,.68,1.1),.024,.012,steel,upper)
box('Right hydraulic console',(.57,.02,1.29),(.30,.84,.30),yellow,upper,.07)
decal('Model badge','TC 18',(.809,-.57,1.25),.10,upper)
interior=group('Interior',parent=upper)
box('Seat base',(-.24,-.20,1.43),(.54,.58,.17),rubber,interior,.08)
box('Seat back',(-.24,-.46,1.72),(.54,.13,.55),rubber,interior,.09)
box('Floor',(0,.26,1.12),(1.3,.85,.09),dark,upper)
for x in [-.67,.67]:
    bar('Rear ROPS post',(x,-.75,1.1),(x,-.58,2.66),.06,dark,upper)
    bar('ROPS roof rail',(x,-.58,2.66),(x,.49,2.70),.05,dark,upper)
    bar('Front canopy post',(x,.53,1.15),(x,.49,2.70),.035,dark,upper)
panel('Pressed canopy',[(-.76,-.68),(-.66,-.80),(.66,-.80),(.76,-.68),(.72,.59),(.60,.68),(-.60,.68),(-.72,.59)],2.72,2.81,cream,upper,.055)
box('Canopy underside',(0,-.04,2.69),(1.38,1.23,.05),dark,upper,.06)
for x in [-.53,.53]:
    box('Work lamp housing',(x,.65,2.66),(.20,.12,.13),dark,upper,.028)
    box('Work lamp lens',(x,.719,2.66),(.16,.012,.085),light,upper,.01)
box('Canopy ridge',(0,-.1,2.805),(.9,.9,.035),cream,upper,.05)
cyl('Beacon base',(.57,-.5,2.88),.075,.08,dark,upper)
cyl('Amber beacon',(.57,-.5,2.98),.075,.15,yellow,upper)
for x in [-.59,.11]:
    box('Arm rest',(x,-.08,1.65),(.15,.42,.11),rubber,interior)
    bar('Joystick',(x,.08,1.67),(x,.14,1.85),.026,steel,interior)
    box('Joystick grip',(x,.14,1.85),(.07,.08,.12),rubber,interior)
    bar('Sleeve',(x,-.20,1.95),(x,-.04,1.78),.07,blue,interior)
    bar('Forearm',(x,-.04,1.78),(x,.14,1.84),.05,skin,interior)
ellipsoid('Jacket',(-.24,-.20,1.81),(.22,.18,.28),blue,interior)
for x in [-.36,-.12]:box('Vest reflective stripe',(x,-.01,1.85),(.035,.012,.27),yellow,interior,.008)
ellipsoid('Head',(-.24,-.16,2.17),(.125,.14,.175),skin,interior)
ellipsoid('Nose',(-.24,-.02,2.16),(.038,.042,.047),skin,interior)
ellipsoid('Hard hat crown',(-.24,-.16,2.32),(.155,.17,.10),yellow,interior)
cyl('Hard hat brim',(-.24,-.14,2.30),.185,.023,yellow,interior)
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
# Continuous, thick curved shell with rolled heel, side cutters and tapered wear teeth.
# Local -Y is the mouth, toward the operator; tooth contact stays at (-.70,-.35).
profile=[]
segments=[((.14,.08),(.24,-.13),(.10,-.32)),((.10,-.32),(-.06,-.55),(-.32,-.48)),((-.32,-.48),(-.51,-.44),(-.62,-.35))]
for a,c,b in segments:
    for j in range(6):
        t=j/6;profile.append(((1-t)**2*a[0]+2*t*(1-t)*c[0]+t*t*b[0],(1-t)**2*a[1]+2*t*(1-t)*c[1]+t*t*b[1]))
profile.append(segments[-1][2])
n=len(profile)
verts=[(x,y,z) for x in [-.38,.38] for y,z in profile]
faces=[(i,i+n,i+n+1,i+1) for i in range(n-1)]
mesh=bpy.data.meshes.new('Rolled scoop shell');mesh.from_pydata(verts,[],faces);mesh.update()
ob=bpy.data.objects.new('Rolled scoop shell',mesh);bpy.context.collection.objects.link(ob);finish(ob,'Rolled scoop shell',wear,bucket)
for face in mesh.polygons:face.use_smooth=True
mod=ob.modifiers.new('Steel plate thickness','SOLIDIFY');mod.thickness=.045
for x in [-.39,.39]:
    cheek=profile_x('Bucket side plate',profile,.045,dark,bucket,.008);cheek.location.x=x
    cheek=profile_x('Side wear plate',[(-.33,-.43),(-.63,-.35),(-.53,-.28),(-.22,-.37)],.058,wear,bucket,.006);cheek.location.x=x
box('Welded cutting lip',(0,-.60,-.35),(.82,.105,.06),wear,bucket,.008)
for x in [-.27,-.09,.09,.27]:
    verts=[(x+dx,y,z) for y,w,z,h in [(-.53,.065,-.35,.048),(-.70,.035,-.35,.020)] for dx,z in [(-w,z-h),(w,z-h),(w,z+h),(-w,z+h)]]
    mesh=bpy.data.meshes.new('Tapered tooth');mesh.from_pydata(verts,[],[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]);mesh.update()
    ob=bpy.data.objects.new('Replaceable tooth',mesh);bpy.context.collection.objects.link(ob);finish(ob,'Replaceable tooth',steel,bucket,.005)
    cyl('Tooth keeper',(x,-.54,-.293),.018,.014,steel,bucket)
for x in [-.19,.19]:
    profile_x('Quick hitch ear',[(-.15,.02),(-.13,.18),(.12,.24),(.21,.14),(.17,.04)],.075,wear,bucket,.012).location.x=x
    # Coupler ears straddle the center linkage.
for x in [-.26,0,.26]:
    hose('Bucket wear rib',[(x,y,z-.029) for y,z in profile[4:16:2]],bucket,.014)
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
