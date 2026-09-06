# Trenchcraft

Earth is now physical. Every bite of soil becomes clods: equal-radius particles with gravity, contacts, Coulomb friction and light cohesion, solved with position-based dynamics. The authored scoop shell (rolled plate, side cheeks and toothed lip, sampled from the same curves as the Blender model) pushes, carries and releases them, so the load rides in the bowl through a lift and swing, heaps above the rim, spills when tilted too far and pours out of the mouth when opened. Loose clods land, settle, sleep and are returned to the 25 cm ground grid with their volume intact; each clod stands for a quarter of a litre of bank soil, a full bucket is about 880 clods and the solver is bounded at 6,000. Joint rates ramp like hydraulics (swing over about 0.4 s, the arm over about 0.2 s, stops quickly), so a heaped load is not jolted off the bucket. `src/soil.ts` is the solver, `src/bucket-shell.ts` the bucket collider, and `src/bucket-soil.ts` draws a continuous soil skin over the carried clods. Cutting still follows tooth travel through the bank, but the removed volume now breaks out of the cut column as clods in front of the teeth (the failure-zone idea used by earthmoving simulators such as AGX Terrain), and the curling bowl has to sweep them in; cut earth left on the bank stops counting as load. Clods, the bucket skin and cut ground share one colour and grain, clods rest on exactly the fan of triangles the land mesh draws, and an island check wakes any sleeping clod without a chain of support to the ground. `node tools/soil-check.mjs` drives a real scoop, lift, swing and dump with close-ups. Saves move to version 3 (carried and loose clods); earlier saves migrate and their bucket volume rests in the bowl.

A gentle, stylized mini-excavator practice game. Built for two thumbs on a phone or iPad, with keyboard and dual-stick gamepad support. The first job is a six-metre service trench on a small practice plot: learn to reach, curl, lift, swing and place spoil while keeping the cut straight.

## Run

Requires Node.js 22.12+ (developed with Node 24).

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5174/**. To test on a phone or iPad on the same network, run `npm run dev -- --host 0.0.0.0` and open the computer's LAN address on port 5174. The standard command listens only on localhost.

```sh
npm test
npm run build
npm run preview
```

Play the public build at **https://001ben.github.io/trenchcraft/**. Source: **https://github.com/001ben/trenchcraft**.

GitHub Actions runs the unit tests and builds with the `/trenchcraft/` base path before deploying `main` to GitHub Pages. Pull requests run checks without deploying. Saves stay local to their browser origin, so localhost and the hosted game have separate progress.

## Playing

Every visit opens straight into **cab view** with **ISO controls**, with saved earthwork restored and no start menu. Switching tabs or losing focus pauses quietly; returning resumes play without opening the guide. An explicitly opened guide remains paused until you close it. Use **?** whenever you want the lesson, settings or a pause. Drag either joystick from its centre, or use WASD for the left hand and arrow keys for the right hand. Both sticks can move together. Releasing a stick stops its input. Touch cancellation, resizing, tab hiding and losing focus clear active inputs. A connected gamepad uses axes 0–3 with a dead zone.

| Direction    | ISO left joystick | ISO right joystick |
| ------------ | ----------------- | ------------------ |
| Forward / up | Arm out           | Boom down          |
| Back / down  | Arm in            | Boom up            |
| Left         | Swing left        | Bucket curl        |
| Right        | Swing right       | Bucket empty       |

The guide offers **Alternate · boom on left**, which swaps the boom and arm axes while retaining swing on the left hand and curl on the right. Labels and the lesson change with the selected pattern for that visit; opening or reloading the game returns to ISO. ISO is the default; “universal” does not mean every real machine is configured identically. The mapping is based on [Kubota's U10-5 operator manual, printed pages 38–41](https://media.kubota.io/uploads/U10-Ops-Manual_LR.pdf).

The round joysticks always control the attachments. Two separate, spring-centred **travel levers** sit immediately inside the joysticks, within thumb reach on phones and tablets. Push both up to travel forward, pull both down to reverse, or move them in opposite directions to pivot. Releasing a lever stops that track. Track and attachment inputs can operate together; there is no Dig/Drive mode switch. This follows the separate left/right travel-lever arrangement in [Kubota's manual, printed pages 35–37](https://media.kubota.io/uploads/U10-Ops-Manual_LR.pdf).

Keyboard travel uses **Q / Z** for the left track (forward/reverse), **E / C** for the right. WASD and arrows keep their digging functions. On a standard gamepad, the left/right bumpers drive their tracks forward and triggers reverse. Travel is relative to the tracks, even when the upper carriage is swung around.

The permanent minimap is removed for this small plot. The guide still offers **Plot overview** when you want to see the full trench and spoil strip. Trench progress and bucket load/depth remain visible; detailed star, straightness and tidiness scores live in the guide.

Lower the teeth against the soil, then curl and pull the arm in. Untouched ground resists further lowering; curling/crowding takes a bite. The bucket holds **0.22 m³**, with a visible soil mound and a percentage indicator. Lift it clear, swing toward the amber spoil strip and open it: the clods slide out of the mouth under gravity, land, settle and become part of the ground. A tipped bucket continues emptying after you release the stick. Using several attachment movements together shares hydraulic speed, and a full bucket lifts slightly more slowly.

The dashed cream line marks a **6 m × 1 m** practice trench with a **0.6 m** target depth. The cutting footprint is narrower than the trench, so adjacent bites are needed. Move the tracks to reach the full length.

The fenced block starts as a grassy yard with trees, shrubs and a small shed. Grass and tufts disappear at the cutting point to reveal brown soil. Backfilled cuts stay bare; a fresh-plot reset restores the lawn.

Stars reward actual earthwork:

- One star: at least 80% of target excavation.
- Two stars: 90% excavation and 85% of all cuts on the intended line.
- Three stars: 95% excavation, 95% on line and 85% of above-ground spoil in its marked strip.

Backfilling reduces progress. Re-digging the same cells cannot erase earlier off-line cuts. Volume is conserved between ground, bucket and falling soil. Progress, terrain, carried and loose clods and control pattern save in `trenchcraft-save-v1` on this browser. The key is unchanged; version 3 records migrate earlier saves automatically, resting any saved bucket volume in the bowl as clods. The guide contains a confirmed fresh-plot reset.

## Source map

| File                               | Responsibility                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/simulation.ts`                | Joint kinematics, input pattern, terrain edits, clod capture and release, score and saves       |
| `src/soil.ts`                      | Physical clods: contacts, friction, cohesion, sleeping and return to the ground grid            |
| `src/bucket-shell.ts`              | Bucket collision shell from the authored outline; carried/loose classification and fill slots  |
| `src/bucket-soil.ts`               | Continuous soil skin over the carried clods and the bank contact strip                          |
| `src/controls.ts`                  | Two independent captured pointers, keyboard and gamepad input                                   |
| `src/view.ts`                      | Three.js plot, animated Blender joints and track shoes, ground instances, particles and cameras |
| `src/hydraulics.ts`                | Cylinder/rod visuals connected to moving attachment pivots                                      |
| `src/main.ts`                      | Game loop, minimal HUD, guide, sound and save lifecycle                                         |
| `art/build_excavator.py`           | Original Blender model authoring and GLB export                                                 |
| `art/mini-excavator.blend`         | Editable, posed source model                                                                    |
| `public/models/mini-excavator.glb` | Game-ready articulated model                                                                    |
| `tests/simulation.test.ts`         | Deterministic gameplay and conservation checks                                                  |
| `tools/browser-check.mjs`          | Physical browser input, screenshots and touch checks (Edge)                                     |
| `tools/model-check.mjs`            | Render/simulation joint agreement and a small timing sample                                     |
| `tools/bucket-check.mjs`           | Empty/partial/full scoop and falling-soil close-ups; track animation direction checks           |
| `tools/soil-check.mjs`             | Real scoop, lift, swing and dump with bowl close-ups, retention and settling checks            |

The reference-guided visual pass and its source photographs are documented in [art/REFERENCES.md](art/REFERENCES.md). The body, canopy, tapered boom, hoses, track details and animated bucket rocker follow those references while retaining the established digging reach.

Rebuild the model with Blender 5:

The latest visual pass adds formed body panels, cooling louvres, graphite canopy, distinct enamel/rubber/steel materials, a continuously curved bucket shell, tapered teeth and instanced chevron track ribs. One generated environment supplies metal reflections without dynamic capture or post-processing. The GLB is 1.61 MB.

`src/land-surface.ts` renders the authoritative 25 cm soil grid as a connected surface with shared corners, subtle irregular edges and smooth normals. A small mipmapped grain texture adds detail. Cell-center heights remain exact; edits upload only nearby vertices/normals. Grass stays removed after backfill. Buried box faces are gone, grass tufts and transient dirt are instanced, and the clod solver is bounded at 6,000 particles. Run `node tools/terrain-benchmark.mjs after` for the repeatable busy-scene comparison documented in VERIFICATION.md.

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.0/blender.exe' --background --python art/build_excavator.py
```

The GLB exports at zero joint angles. Runtime poses rotate `Upper`, `Boom`, `Stick` and `Bucket`; the `.blend` is saved in a readable working pose. The backhoe scoop opens toward the cab and its teeth curl inward/upward; its silhouette was checked against [Kubota's U17 photographs](https://www.kubotausa.com/docs/default-source/brochure-sheets/u17.pdf). `BucketFill` is an anchor for the growing runtime soil mound. Keep link lengths, bucket mounting angle and tooth offsets aligned with `ARM` in the simulation. Run the model check after changing either side.

## Design intent and limits

This is a controls-familiarity game, not machine certification or an excavation safety simulator. It uses kinematic joints with ramped rates, a 25 cm soil height grid, approximate tooth contact and a bounded particle soil (at most 6,000 clods, with settled earth returned to the grid). Clods collide with the bucket shell and the ground but not with the machine body or tracks. It does not model real hydraulic forces, undercarriage contact physics, bank collapse ahead of the teeth or underground services. Soil is cut when inward-moving teeth overlap it while curling/crowding; there is no force feedback. Cab visibility and depth judgement need real user feedback. Test ergonomics and GPU performance on an actual phone/iPad before calling them proven.

GILT Quarry Works was design/engineering reference material: retain bounded rendering, physical input checks, careful saves and compact mobile UI. Its game code and assets were not copied into this project. This game has its own original Blender model and its own simulation, controls and scoring.

See [DESIGN.md](DESIGN.md) for the intended next passes and [VERIFICATION.md](VERIFICATION.md) for checked behavior.
