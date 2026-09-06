import * as T from "three";

/** Cylinder barrels and exposed rods stay attached to both moving link pivots. */
export class Hydraulics {
  private links: {
    from: T.Object3D;
    to: T.Object3D;
    a: T.Vector3;
    b: T.Vector3;
    barrel: T.Mesh;
    rod: T.Mesh;
  }[] = [];
  private up = new T.Vector3(0, 1, 0);
  constructor(scene: T.Scene, model: T.Object3D) {
    const barrel = new T.MeshStandardMaterial({
      color: 0x38534a,
      metalness: 0.45,
      roughness: 0.4,
    });
    const chrome = new T.MeshStandardMaterial({
      color: 0xaebfb9,
      metalness: 0.85,
      roughness: 0.22,
    });
    const links: [string, number[], string, number[]][] = [
      ["Upper", [0, 1.35, -0.2], "Boom", [0, 0.22, -1.25]],
      ["Boom", [0, 0.43, -1.35], "Stick", [0, 0.24, -0.58]],
      ["Stick", [0, 0.27, -1.1], "Bucket", [0, 0.13, -0.12]],
    ];
    for (const [from, a, to, b] of links) {
      const tube = new T.Mesh(
          new T.CylinderGeometry(0.085, 0.085, 1, 12),
          barrel,
        ),
        rod = new T.Mesh(new T.CylinderGeometry(0.038, 0.038, 1, 10), chrome);
      tube.castShadow = rod.castShadow = true;
      scene.add(tube, rod);
      this.links.push({
        from: model.getObjectByName(from)!,
        to: model.getObjectByName(to)!,
        a: new T.Vector3(...a),
        b: new T.Vector3(...b),
        barrel: tube,
        rod,
      });
    }
  }
  update() {
    for (const link of this.links) {
      const a = link.from.localToWorld(link.a.clone()),
        b = link.to.localToWorld(link.b.clone()),
        direction = b.clone().sub(a),
        length = direction.length();
      direction.normalize();
      link.barrel.position.copy(a).addScaledVector(direction, length * 0.3);
      link.barrel.scale.y = length * 0.6;
      link.barrel.quaternion.setFromUnitVectors(this.up, direction);
      link.rod.position.copy(a).addScaledVector(direction, length * 0.76);
      link.rod.scale.y = length * 0.48;
      link.rod.quaternion.copy(link.barrel.quaternion);
    }
  }
}
