import { clamp, neutral, type Controls } from "./simulation";
/** Each thumb owns its own captured pointer. Losing focus clears both sticks and keys. */
export class Input {
  value = neutral();
  keys = new Set<string>();
  private cancellations: (() => void)[] = [];
  constructor(left: HTMLElement, right: HTMLElement) {
    for (const [root, x, y] of [
      [left, "lx", "ly"],
      [right, "rx", "ry"],
    ] as const) {
      let pointer: number | null = null;
      const knob = root.querySelector<HTMLElement>(".knob")!;
      const release = () => {
        const previous = pointer;
        pointer = null;
        this.value[x] = this.value[y] = 0;
        knob.style.transform = "translate(0,0)";
        root.classList.remove("active");
        if (previous !== null && root.hasPointerCapture(previous))
          root.releasePointerCapture(previous);
      };
      const move = (e: PointerEvent) => {
        const r = root.getBoundingClientRect(),
          radius = r.width * 0.3;
        this.value[x] = clamp((e.clientX - r.x - r.width / 2) / radius, -1, 1);
        this.value[y] = clamp((e.clientY - r.y - r.height / 2) / radius, -1, 1);
        knob.style.transform = `translate(${this.value[x] * radius}px,${this.value[y] * radius}px)`;
      };
      root.addEventListener("pointerdown", (e) => {
        if (pointer !== null || e.button !== 0) return;
        e.preventDefault();
        pointer = e.pointerId;
        root.setPointerCapture(pointer);
        root.classList.add("active");
        move(e);
      });
      root.addEventListener("pointermove", (e) => {
        if (e.pointerId === pointer) move(e);
      });
      for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
        root.addEventListener(event, (e) => {
          if ((e as PointerEvent).pointerId === pointer) release();
        });
      this.cancellations.push(release);
    }
    window.addEventListener("keydown", (e) => {
      if (
        [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
        ].includes(e.code)
      ) {
        if ((e.target as HTMLElement).closest("dialog")) return;
        e.preventDefault();
        this.keys.add(e.code);
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.clear());
    window.addEventListener("resize", () => this.clear());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.clear();
    });
  }
  clear() {
    for (const cancel of this.cancellations) cancel();
    this.keys.clear();
  }
  read(travel: boolean): Controls {
    const v = { ...this.value, travel };
    const key = (code: string) => Number(this.keys.has(code));
    v.lx = clamp(v.lx + key("KeyD") - key("KeyA"), -1, 1);
    v.ly = clamp(v.ly + key("KeyS") - key("KeyW"), -1, 1);
    v.rx = clamp(v.rx + key("ArrowRight") - key("ArrowLeft"), -1, 1);
    v.ry = clamp(v.ry + key("ArrowDown") - key("ArrowUp"), -1, 1);
    const pad = navigator
      .getGamepads?.()
      .find((p) => p?.connected && p.axes.length >= 4);
    if (pad)
      for (const [i, k] of (["lx", "ly", "rx", "ry"] as const).entries()) {
        const axis = pad.axes[i];
        if (Math.abs(axis) > 0.15)
          v[k] = (Math.sign(axis) * (Math.abs(axis) - 0.15)) / 0.85;
      }
    return v;
  }
}
