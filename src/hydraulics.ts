import * as T from "three";

/** Visible cylinders and the bucket's two-link rocker, in the boom's working plane. */
export class Hydraulics {
  private links: {
    from: T.Object3D;
    to: T.Object3D;
    a: T.Vector3;
    b: T.Vector3;
    barrel: T.Mesh;
    rod: T.Mesh;
    barrelLength: number;
  }[] = [];
  private up = new T.Vector3(0, 1, 0);
  private rocker = new T.Object3D();
  private arms: T.Mesh[] = [];
  private stick: T.Object3D;
  private bucket: T.Object3D;
  private base = new T.Vector3(0, 0.2, -1.97);
  private attachment = new T.Vector3(0, 0.22, -0.16);
  constructor(scene: T.Scene, model: T.Object3D) {
    const barrel = new T.MeshStandardMaterial({
      color: 0xd9a332,
      metalness: 0.4,
      roughness: 0.42,
    });
    const chrome = new T.MeshStandardMaterial({
      color: 0xb5c6c1,
      metalness: 0.85,
      roughness: 0.22,
    });
    const linkMaterial = new T.MeshStandardMaterial({
      color: 0x42594d,
      metalness: 0.55,
      roughness: 0.45,
    });
    this.stick = model.getObjectByName("Stick")!;
    this.bucket = model.getObjectByName("Bucket")!;
    scene.add(this.rocker);
    const pin = new T.Mesh(
      new T.CylinderGeometry(0.065, 0.065, 0.54, 12),
      chrome,
    );
    pin.rotation.z = Math.PI / 2;
    this.rocker.add(pin);
    pin.castShadow = true;
    for (let i = 0; i < 4; i++) {
      const arm = new T.Mesh(new T.BoxGeometry(0.065, 1, 0.11), linkMaterial);
      arm.castShadow = true;
      scene.add(arm);
      this.arms.push(arm);
    }
    const links: [T.Object3D, number[], T.Object3D, number[], number][] = [
      [
        model.getObjectByName("Upper")!,
        [0, 1.1, -0.65],
        model.getObjectByName("Boom")!,
        [0, 0.55, -1.25],
        1.0,
      ],
      [
        model.getObjectByName("Boom")!,
        [0, 0.98, -1.38],
        this.stick,
        [0, 0.32, -0.42],
        1.05,
      ],
      [this.stick, [0, 0.3, -0.55], this.rocker, [0, 0, 0], 0.85],
    ];
    for (const [from, a, to, b, barrelLength] of links) {
      const tube = new T.Mesh(
        new T.CylinderGeometry(0.08, 0.08, 1, 12),
        barrel,
      );
      const rod = new T.Mesh(
        new T.CylinderGeometry(0.033, 0.033, 1, 10),
        chrome,
      );
      tube.castShadow = rod.castShadow = true;
      scene.add(tube, rod);
      this.links.push({
        from,
        to,
        a: new T.Vector3(...a),
        b: new T.Vector3(...b),
        barrel: tube,
        rod,
        barrelLength,
      });
    }
  }
  update() {
    // Intersect two fixed-length links instead of stretching decorative bars.
    const end = this.stick.worldToLocal(
      this.bucket.localToWorld(this.attachment.clone()),
    );
    const span = end.clone().sub(this.base),
      distance = span.length();
    span.normalize();
    const along = (0.4 ** 2 - 0.36 ** 2 + distance ** 2) / (2 * distance);
    const height = Math.sqrt(Math.max(0, 0.4 ** 2 - along ** 2));
    const joint = this.base
      .clone()
      .addScaledVector(span, along)
      .addScaledVector(new T.Vector3(0, -span.z, span.y), height);
    this.rocker.position.copy(this.stick.localToWorld(joint.clone()));
    this.stick.getWorldQuaternion(this.rocker.quaternion);
    this.rocker.updateMatrixWorld(true);
    for (let i = 0; i < 4; i++) {
      const a = (i % 2 === 0 ? this.base : joint).clone(),
        b = (i % 2 === 0 ? joint : end).clone();
      a.x = b.x = i < 2 ? -0.22 : 0.22;
      this.stick.localToWorld(a);
      this.stick.localToWorld(b);
      const direction = b.clone().sub(a),
        arm = this.arms[i];
      arm.position.copy(a).addScaledVector(direction, 0.5);
      arm.scale.y = direction.length();
      arm.quaternion.setFromUnitVectors(this.up, direction.normalize());
    }
    for (const link of this.links) {
      const a = link.from.localToWorld(link.a.clone()),
        b = link.to.localToWorld(link.b.clone());
      const direction = b.clone().sub(a),
        length = direction.length();
      direction.normalize();
      const barrelLength = Math.min(link.barrelLength, length * 0.85),
        rodStart = barrelLength * 0.88;
      link.barrel.position.copy(a).addScaledVector(direction, barrelLength / 2);
      link.barrel.scale.y = barrelLength;
      link.barrel.quaternion.setFromUnitVectors(this.up, direction);
      link.rod.position
        .copy(a)
        .addScaledVector(direction, (rodStart + length) / 2);
      link.rod.scale.y = length - rodStart;
      link.rod.quaternion.copy(link.barrel.quaternion);
    }
  }
}
