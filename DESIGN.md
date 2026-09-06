# The next good dig

The user wants a relaxed learning game for someone becoming familiar with a mini excavator, inspired by plumbing trench work. The centre of the experience is operating the machine with two sticks, not opening menus. Start with a small, readable plot, pleasant cartoony machinery and earth that moves in response to the bucket. Chase view helps a novice judge the full linkage; cab view offers a more immersive next step.

## First-pass decisions

- ISO default with an explicit alternate mapping; teach the actions on each direction rather than relying on a brand name.
- Simultaneous touch joysticks with independent pointer ownership. Preserve keyboard/gamepad paths for desktop experimentation.
- One clearly marked trench and one spoil strip. Score depth progress, off-line cuts and tidy placement using ground state.
- Keep the bucket finite. Lift before discharge; move the upper carriage independently from the tracks.
- Author the machine in Blender and keep its pivots explicit. Verify the rendered cutting point against the simulation.
- Use one instanced soil mesh, a bounded clod solver that sleeps settled earth and returns it to the grid, and a capped render pixel ratio. Avoid thousands of awake rigid bodies.
- Keep the project independent of GILT; borrow lessons about verification and interaction, not its game loop or vehicles.

## Next passes, after a playtest

1. **Watch a novice and an operator play.** Verify the pattern against the intended real mini excavator. Record confusion about left/right, arm versus boom, camera depth and travel direction. Tune stick sensitivity and add a slower practice setting from that evidence.
2. **Teach one motion at a time.** A short sequence of reach markers, scoop targets and spoil targets should precede the full trench. Keep labels visible until the player chooses to hide them. Show a brief end-of-job card with a trench cross-section and where the cut wandered.
3. **Refine contact from operator feedback.** Soil is now physical: clods with friction and cohesion, a bucket shell that carries and releases them, and settled earth returned to the grid. Cut earth now breaks out of the bank in front of the teeth and has to be swept in. Next, measure the clod budget on real phones, let the bank face slump into clods on its own, and give clods contact with the machine body and tracks.
4. **Make terrain more expressive.** Smoother walls, better cut faces and modest mound slumping without losing the bounded simulation or volume conservation. Add a grade/depth reference next to the bucket and checkpoints along the line.
5. **More plumbing-themed practice plots.** Short straight runs, bends, narrow access and different depths on fictional cleared ground. Keep the exercises distinct from real underground-service work.

## Verification gates

Control changes need tests for both patterns and physical two-thumb input. Model changes need the kinematics check plus chase, cab and close-up images. Terrain changes need volume conservation, capacity, scoring and save round trips. Mobile claims need a real-device pass; browser viewport emulation alone is not enough.
