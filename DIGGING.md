# Digging contact review — September 8

The reported “presses against dirt and does nothing” has two reproduced causes. GitHub Pages deploys `main`, but the previous fix was pushed only to `soil-continuity`. The live deployment is `2146f89`, whose lower-only input removes no soil. Separately, even the new code removes exactly zero soil with bucket angles −0.8 or −1.2 radians: it requires the bucket opening to face upward before cutting. Teeth can point into the soil while the opening faces sideways or down, so that is the wrong admission test.

## Research and interpretation

[Algoryx's terrain documentation](https://www.algoryx.se/documentation/complete/agx/html/doc/UserManual/source/agxTerrain.html) distinguishes penetration, cutting/separation, and pushing or grading. Its tool definition includes a cutting edge and tooth direction. Solid soil in a failure zone becomes dynamic material, and resistance is separate from ordinary particle contacts. For this game, that supports checking movement along the teeth rather than the upward orientation of the bucket mouth. It does not justify removing contact resistance or treating every bucket surface as a cutting edge.

[Servin, Berglund and Nystedt's multiscale terrain paper](https://arxiv.org/html/2011.00459) distinguishes penetration along a plate from separation normal to it. Its failure zone reaches from the edge to the free surface, and its resistance depends on soil properties and engagement depth. Our constant 10 cm penetration allowance is only a game constraint; it is not a soil-force model. A future force model needs separate cutting-depth, material and available-actuator-effort terms, calibrated against observable movement.

[Vortex's Earthwork Systems documentation](https://docs.vortexsim.com/latest_ga/user-guides/vortex-theory-guide/earthwork-systems/) describes a hybrid of terrain and particles with reaction forces. Keeping undisturbed ground in a compact grid and representing disturbed soil with local particles remains a reasonable architecture here. Adding more particles alone will not fix an incorrect cut-admission rule.

## Bounded correction

1. Use movement projected along the tooth direction to admit a cut. Mouth orientation continues to govern carrying and spilling.
2. Weight both dimensions of the cutting footprint continuously where they overlap a terrain cell, instead of admitting or dropping whole candidate cells at their centres.
3. Keep disturbed soil dynamic inside cells being cut during the step, instead of immediately packing it back into the same hole. In a controlled −0.8 rad bucket probe, this alone changed final penetration from 0.21 m to 0.77 m. Keep the capacity bound and joint limits; stationary teeth, withdrawal and the back of a curled bucket must not manufacture a cut.
4. Verify opened-bucket penetration, several headings and update rates, air motion, withdrawal, full-bucket resistance, real keyboard/touch operation and soil conservation. Publish to the actual Pages branch and verify the hosted game.

These changes target reproduced blockers and grid-dependent contact. They do not claim a calibrated hydraulic or continuum-soil simulation.

## Next physics boundary

Current `pending` clods are still booked as bucket load before entering the bowl. A three-second lower-only probe with bucket angle 1.5 reported 0.213 m³ load although only 0.00025 m³ was actually carried. This can show a full bucket and limit cutting while most dirt remains beside the lip. The next model should create loosened soil as loose mass and count it as load only on entry; cuts, carried mass, loose mass and deposited ground should be distinct transfers. That change needs new capacity and save-migration tests, rather than silently changing the meaning of existing saves.

A broader excavation model should sweep the whole cutting edge between accepted poses, break a bounded wedge ahead of it, and slow the engaged motion smoothly with depth and material resistance. The contact constraint still samples cell heights: using the smoothed visible surface directly caused shallow stalls because the finite cutting strip cannot lower all the corners influencing that surface. Unify the cut volume and collision surface together rather than swapping only the height query. Keep curl and lift available to escape contact. Validate complete reach/penetrate/curl/lift/dump cycles and partial-stick input; a single final depth or screenshot does not establish smooth control. Bank slumping and chassis contact can follow once cutting and load accounting are trustworthy.
