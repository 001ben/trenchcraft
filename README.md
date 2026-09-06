# Trenchcraft

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

The plot opens straight into **Dig** with ISO as the fresh-game default; there is no start menu. Use **?** whenever you want the lesson, settings or a pause. Drag either joystick from its centre, or use WASD for the left hand and arrow keys for the right hand. Both sticks can move together. Releasing a stick stops its input. Touch cancellation, resizing, tab hiding and losing focus clear active inputs. A connected gamepad uses axes 0–3 with a dead zone.

| Direction    | ISO left joystick | ISO right joystick |
| ------------ | ----------------- | ------------------ |
| Forward / up | Arm out           | Boom down          |
| Back / down  | Arm in            | Boom up            |
| Left         | Swing left        | Bucket curl        |
| Right        | Swing right       | Bucket empty       |

The guide offers **Alternate · boom on left**, which swaps the boom and arm axes while retaining swing on the left hand and curl on the right. Labels and the lesson change with the selected pattern. ISO is the default; “universal” does not mean every real machine is configured identically. The mapping is based on [Kubota's U10-5 operator manual, printed pages 38–41](https://media.kubota.io/uploads/U10-Ops-Manual_LR.pdf).

Tap **Drive** in the top bar. Drive mode gives each hand its own track's forward/reverse lever. Push both forward to travel; opposite directions pivot. Travel is relative to the tracks, even when the upper carriage is swung around. Tap **Dig** to return to attachments. The sticks are labelled Left track and Right track while driving. Cab/chase views are in the top bar; the guide also offers a plot overview and optional synthesized sound.

Lower the teeth against the soil, then curl and pull the arm in. Untouched ground resists further lowering; curling/crowding takes a bite. The bucket holds **0.22 m³**, with a visible soil mound and a percentage indicator. Lift it clear, swing toward the amber spoil strip and open it: soil falls from the cutting lip under gravity and builds a pile on impact. A tipped bucket continues emptying after you release the stick. Using several attachment movements together shares hydraulic speed, and a full bucket lifts slightly more slowly.

The dashed cream line marks a **6 m × 1 m** practice trench with a **0.6 m** target depth. The cutting footprint is narrower than the trench, so adjacent bites are needed. Move the tracks to reach the full length.

The fenced block starts as a grassy yard with trees, shrubs and a small shed. Grass and tufts disappear at the cutting point to reveal brown soil. Backfilled cuts stay bare; a fresh-plot reset restores the lawn.

Stars reward actual earthwork:

- One star: at least 80% of target excavation.
- Two stars: 90% excavation and 85% of all cuts on the intended line.
- Three stars: 95% excavation, 95% on line and 85% of above-ground spoil in its marked strip.

Backfilling reduces progress. Re-digging the same cells cannot erase earlier off-line cuts. Volume is conserved between ground, bucket and falling soil. Progress, terrain, bucket contents, airborne soil and control pattern save in `trenchcraft-save-v1` on this browser. The key is unchanged; version 2 records migrate earlier saves automatically. The guide contains a confirmed fresh-plot reset.

## Source map

| File                               | Responsibility                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/simulation.ts`                | Joint kinematics, input pattern, terrain edits, volume, score and save validation                    |
| `src/controls.ts`                  | Two independent captured pointers, keyboard and gamepad input                                        |
| `src/view.ts`                      | Three.js plot, animated Blender joints and track shoes, ground instances, particles, cameras and map |
| `src/hydraulics.ts`                | Cylinder/rod visuals connected to moving attachment pivots                                           |
| `src/main.ts`                      | Game loop, minimal HUD, guide, sound and save lifecycle                                              |
| `art/build_excavator.py`           | Original Blender model authoring and GLB export                                                      |
| `art/mini-excavator.blend`         | Editable, posed source model                                                                         |
| `public/models/mini-excavator.glb` | Game-ready articulated model                                                                         |
| `tests/simulation.test.ts`         | Deterministic gameplay and conservation checks                                                       |
| `tools/browser-check.mjs`          | Physical browser input, screenshots and touch checks (Edge)                                          |
| `tools/model-check.mjs`            | Render/simulation joint agreement and a small timing sample                                          |
| `tools/bucket-check.mjs`           | Empty/partial/full scoop and falling-soil close-ups; track animation direction checks                |

The reference-guided visual pass and its source photographs are documented in [art/REFERENCES.md](art/REFERENCES.md). The body, canopy, tapered boom, hoses, track details and animated bucket rocker follow those references while retaining the established digging reach.

Rebuild the model with Blender 5:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.0/blender.exe' --background --python art/build_excavator.py
```

The GLB exports at zero joint angles. Runtime poses rotate `Upper`, `Boom`, `Stick` and `Bucket`; the `.blend` is saved in a readable working pose. The backhoe scoop opens toward the cab and its teeth curl inward/upward; its silhouette was checked against [Kubota's U17 photographs](https://www.kubotausa.com/docs/default-source/brochure-sheets/u17.pdf). `BucketFill` is an anchor for the growing runtime soil mound. Keep link lengths, bucket mounting angle and tooth offsets aligned with `ARM` in the simulation. Run the model check after changing either side.

## Design intent and limits

This is a controls-familiarity game, not machine certification or an excavation safety simulator. It uses kinematic joints, a 25 cm soil height grid, approximate tooth contact and a bounded 64-clod gravity simulation. It does not model real hydraulic forces, full bucket/body collisions, undercarriage contact physics, soil collapse or underground services. Soil is cut when inward-moving teeth overlap it while curling/crowding; there is no force feedback. Cab visibility and depth judgement need real user feedback. Test ergonomics and GPU performance on an actual phone/iPad before calling them proven.

GILT Quarry Works was design/engineering reference material: retain bounded rendering, physical input checks, careful saves and compact mobile UI. Its game code and assets were not copied into this project. This game has its own original Blender model and its own simulation, controls and scoring.

See [DESIGN.md](DESIGN.md) for the intended next passes and [VERIFICATION.md](VERIFICATION.md) for checked behavior.
