# Excavator modeling references

The model is original Blender geometry, using photographs of the Kubota U17 as a visual reference:

- [Kubota U17 brochure](https://www.kubotausa.com/docs/default-source/brochure-sheets/u17.pdf): cover photograph for the open canopy, compact rear housing, bent boom and protected hoses; bucket/quick-coupler photographs and side working-range diagrams for the rear-facing scoop and linkage.
- [Kubota U17 product page](https://www.kubotausa.com/series/construction/compact-excavators/u17): overall machine appearance and the relationship between the low tracks and tall operator station.
- [Kubota U10-5 operator manual](https://media.kubota.io/uploads/U10-Ops-Manual_LR.pdf), printed pages 38–41: ISO control directions.

The visual pass replaces the block-like arm with a continuous tapered boom profile, narrows and lowers the track frames, raises the canopy, rounds the engine/counterweight housing, and adds track rollers, sprocket bolts, a curved blade, steps, work lights, hoses and retaining clips. The operator has seated legs, forearms and separate travel levers.

The three cylinder visuals follow moving attachment anchors. The bucket rocker uses two fixed-length links solved in the dipper plane, keeping the links connected as the bucket turns. The original game reach and joint positions are retained, so this is a stylized machine inspired by the photographs rather than a dimensionally exact U17 replica.

Run `node tools/model-check.mjs` for side/front views and joint/link-length checks, `node tools/bucket-check.mjs` for bucket close-ups, and `node tools/browser-check.mjs` for chase/cab/mobile views and a physical scoop/discharge cycle. Reference photographs are research material and are not included as game assets.
