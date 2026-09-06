# First-pass verification

Seven deterministic tests cover all eight ISO directions, the alternate pattern, neutral behavior, physical arm-driven scoop/dump, capacity, soil conservation, off-plot and over-height dumping, actual trench scoring/backfill, track travel/pivot, corrupt-save rejection and save round trips.

`node tools/browser-check.mjs` drives the actual game with keyboard inputs to take and empty a bucket, verifies a soil mound and saved result, checks cab view and alternate-pattern persistence, and sends two simultaneous touch pointers. It checks cancellation, phone portrait, landscape, tablet and small-phone layouts, then exercises reset cancellation/confirmation. Screenshots are saved under ignored `.local/`.

`node tools/model-check.mjs` compares the rendered Blender bucket's cutting point with domain kinematics through 90 articulated poses. Initial maximum error was approximately 0.000000091 m. The 1024×768 Windows/Edge sample measured 1.9 ms p95 for simulation plus render submission, 90 draw calls and 81,008 triangles. This is a small desktop sample, not a sustained phone GPU benchmark.

The production build type-checks successfully. A complete human six-metre trench playthrough and real phone/iPad testing remain outstanding. Hydraulic/contact realism, cut-wall appearance and learning effectiveness are first-pass limitations documented in DESIGN.md.

Grass and direct-entry pass: browser checks verify a fresh page and reload open without a blocking start dialog, fresh controls use ISO, and both track levers move the chassis without moving the arm. The render test verifies intact turf disappears when cut and stays absent after backfill. Screenshots cover the fenced grassy parcel, soil cut/spoil and compact phone mode buttons. The added turf and grass use two instanced meshes; the local model check measured 100 draw calls and 3.6 ms p95 on this desktop sample.
