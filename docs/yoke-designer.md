# Yoke designer: development slice

Available at `/yoke-designer` in `next dev` only. Production must return 404.
No production accounts, APIs, database tables or regular chart storage are changed.

## Implemented

- One consistent blocked stitch/row gauge. Knitters adjust needles to maintain it.
- Targets from body chest + ease, upper arm + separate sleeve ease, finished
  neckline, underarm width and full-round front yoke length along the fabric.
- Explicit conversion between cm and inches, including the gauge measurement span.
- Repeat-compatible neck and lower-yoke rounding, with resulting finished sizes
  and stitch adjustments shown before applying.
- Editable increase rounds with post-increase counts. Whole-repeat increments,
  ascending rounds, final target and at-most-doubling constraints are validated.
- Whole-yoke, single-repeat and standard chart drawing views sharing one model.
  Ring and wedge views are design projections, not fit/physics simulations.
  A repeat has an angular span of 2π / repeat count.
- All-repeat painting or individual-repeat variations, zoom and undo/redo.
- Versioned local draft, export/import `.knitplot-yoke`, schema validation,
  quota warnings and optimistic comparison before browser-storage writes.
  Other windows and damaged drafts must never be silently overwritten.

## Stitch accounting

For the simple top-down body/sleeve separation used here, B is the final body
stitch count, S is each upper sleeve count and U is each underarm cast-on count.

- Body from yoke = B − 2U
- Each sleeve held from yoke = S − U
- Total lower yoke = B + 2S − 4U

Round neck and total lower-yoke counts to repeat multiples. Any rounding at the
lower yoke is assigned to the body target and disclosed; sleeve targets stay fixed.
This is an explicit arithmetic convention, not a universal sizing formula.

Short-row allowance = desired extra back height × row gauge, rounded to pairs.
This adds local back height only, NOT full rounds to every stitch or live stitches.

## Deliberate limits / next decisions

- The generated increase spacing is an editable engineering scaffold, not a
  tested fit prescription. It is NOT taken from a published sweater pattern.
  Internal arithmetic tests do not validate fit. Shoulder checkpoints, measurement
  diagrams and comparisons against test-knitted designs are still required.
- Short-row pair count is planning metadata only: no turn positions, double-stitch
  operations, instructions or local-height rendering yet. First intended support:
  plain-colour short rows before colourwork, without increases during those rows.
- Shaping events presently specify resulting counts, not M1L/M1R/kfb placements.
  No ordinary `.knitplot` export is offered until those placements and connections
  are represented correctly. The existing realistic knitted renderer is unchanged.
- Need an entry path for counts from an existing pattern, not measurements only.
- Need measurement illustrations and shoulder/neckline fit controls, band-specific
  repeats, selection tools, and integration with My Charts / Knit Mode.
- Changing the applied structure resets the drawing only after confirmation if
  there are painted cells; undo retains the prior project.
- Limits: 1,200 stitches around, 200 per repeat, 150 full rounds, 2–40 repeats.
  These limits are independent of the ordinary chart-maker limits.

## Verification

`lib/yoke-plan.test.ts` covers arithmetic, rounding, units, short-row separation,
schedule consistency, immutable painting, file schema and rendering/hit-test
agreement. `e2e/yoke.spec.ts` exercises the real UI in the isolated localhost
harness; `e2e/editor.spec.ts` verifies the prototype is absent in production.
