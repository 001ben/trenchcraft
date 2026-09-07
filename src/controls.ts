import { clamp, neutral, type Controls } from "./simulation";
/** Each thumb owns its own captured pointer. Losing focus clears both sticks and keys. */
export class Input {
  value = neutral();
  keys = new Set<string>();
  private cancellations: (() => void)[] = [];
  constructor(
    left: HTMLElement,
    right: HTMLElement,
    leftTrack: HTMLElement,
    rightTrack: HTMLElement,
  ) {
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
        const dx = (e.clientX - r.x - r.width / 2) / radius,
          dy = (e.clientY - r.y - r.height / 2) / radius,
          distance = Math.hypot(dx, dy),
          strength = clamp((distance - 0.1) / 0.9, 0, 1);
        this.value[x] = distance ? (dx / distance) * strength : 0;
        this.value[y] = distance ? (dy / distance) * strength : 0;
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
    for (const [root, axis] of [
      [leftTrack, "leftTrack"],
      [rightTrack, "rightTrack"],
    ] as const) {
      let pointer: number | null = null;
      const knob = root.querySelector<HTMLElement>(".track-knob")!;
      const set = (value: number) => {
        this.value[axis] = value;
        knob.style.transform = `translateY(${-value * root.clientHeight * 0.28}px)`;
        root.setAttribute("aria-valuenow", String(Math.round(value * 100)));
        root.setAttribute(
          "aria-valuetext",
          value > 0.05 ? "Forward" : value < -0.05 ? "Reverse" : "Stopped",
        );
        root.classList.toggle("active", Math.abs(value) > 0.05);
      };
      const release = () => {
        const previous = pointer;
        pointer = null;
        set(0);
        if (previous !== null && root.hasPointerCapture(previous))
          root.releasePointerCapture(previous);
      };
      const move = (e: PointerEvent) => {
        const r = root.getBoundingClientRect();
        const value = clamp(
          (r.y + r.height / 2 - e.clientY) / (r.height * 0.35),
          -1,
          1,
        );
        set(Math.abs(value) < 0.08 ? 0 : value);
      };
      root.addEventListener("pointerdown", (e) => {
        if (pointer !== null || e.button !== 0) return;
        e.preventDefault();
        pointer = e.pointerId;
        root.setPointerCapture(pointer);
        move(e);
      });
      root.addEventListener("pointermove", (e) => {
        if (e.pointerId === pointer) move(e);
      });
      for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
        root.addEventListener(event, (e) => {
          if ((e as PointerEvent).pointerId === pointer) release();
        });
      root.addEventListener("keydown", (e) => {
        if (e.code === "ArrowUp" || e.code === "ArrowDown") {
          e.preventDefault();
          set(e.code === "ArrowUp" ? 1 : -1);
        }
      });
      root.addEventListener("keyup", (e) => {
        if (e.code === "ArrowUp" || e.code === "ArrowDown") {
          e.preventDefault();
          set(0);
        }
      });
      root.addEventListener("blur", release);
      this.cancellations.push(release);
    }
    window.addEventListener("keydown", (e) => {
      if (
        [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "KeyQ",
          "KeyZ",
          "KeyE",
          "KeyC",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
        ].includes(e.code)
      ) {
        if ((e.target as HTMLElement).closest("dialog, .track-control")) return;
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
  read(): Controls {
    const v = { ...this.value };
    const key = (code: string) => Number(this.keys.has(code));
    v.lx = clamp(v.lx + key("KeyD") - key("KeyA"), -1, 1);
    v.ly = clamp(v.ly + key("KeyS") - key("KeyW"), -1, 1);
    v.rx = clamp(v.rx + key("ArrowRight") - key("ArrowLeft"), -1, 1);
    v.ry = clamp(v.ry + key("ArrowDown") - key("ArrowUp"), -1, 1);
    v.leftTrack = clamp(v.leftTrack + key("KeyQ") - key("KeyZ"), -1, 1);
    v.rightTrack = clamp(v.rightTrack + key("KeyE") - key("KeyC"), -1, 1);
    const pad = navigator
      .getGamepads?.()
      .find((p) => p?.connected && p.axes.length >= 4);
    if (pad)
      for (const [i, k] of (["lx", "ly", "rx", "ry"] as const).entries()) {
        const axis = pad.axes[i];
        if (Math.abs(axis) > 0.15)
          v[k] = (Math.sign(axis) * (Math.abs(axis) - 0.15)) / 0.85;
      }
    if (pad && pad.buttons.length >= 8) {
      v.leftTrack = clamp(
        v.leftTrack + pad.buttons[4].value - pad.buttons[6].value,
        -1,
        1,
      );
      v.rightTrack = clamp(
        v.rightTrack + pad.buttons[5].value - pad.buttons[7].value,
        -1,
        1,
      );
    }
    return v;
  }
}
