# Yoke designer

Start a yoke from the chart maker’s File menu. The standalone prototype remains
development-only. Yokes use the existing local and cloud chart storage; this
release adds no database migration. The sweater mockup is front-only and is not
a fit simulation.

## Implemented

- Input modes: body chest/arm + ease, or finished body/sleeve circumference.
  Switching translates those two fields while preserving the finished targets;
  ease is retained as a hidden preference but ignored in finished mode. Reopening
  a saved finished-mode draft must never add that ease again. Negative ease and
  cm/in conversion are supported. Version-1 drafts without a mode default to body.
- A collapsible companion guide has body and sweater vector illustrations with
  numbered field links, focus highlights and measurement-specific instructions.
  The sweater diagram includes underarm-width and extra-back-height insets.
  Neck circumference is measured along its curved edge, not doubled straight
  neck width. Body and sleeve flat-width guidance is distinct from yoke length.
- One consistent blocked stitch/row gauge. Knitters adjust needles to maintain it.
- Targets from body chest + ease, upper arm + separate sleeve ease, finished
  neckline, underarm width and full-round front yoke length along the fabric.
- Explicit conversion between cm and inches, including the gauge measurement span.
- Repeat-compatible neck and lower-yoke rounding, with resulting finished sizes
  and stitch adjustments shown before applying.
- Editable increase rounds with post-increase counts. Whole-repeat increments,
  ascending rounds, final target and at-most-doubling constraints are validated.
- Whole-yoke, single-repeat and standard chart drawing views sharing one model.
- Front/back half-yoke views show stitch-aligned halves, including sleeve portions;
  they are not isolated front/back body panels or a 3D garment projection.
- The standard view uses the regular ChartGrid, including numbering, symbols and
  no-stitch placeholders. Columns follow new-stitch placement backwards through
  earlier rounds instead of centring independent strips.
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

- Automatic shaping starts around 25% growth per increase round and tapers
  toward 15%, rounded down to whole repeats with at least one stitch per repeat.
  These numbers are KnitPlot defaults, not a fitting formula. [Ann Budd's
  top-down example](https://www.interweave.com/article/knitting/the-top-down-yoke-a-classic-wardrobe-builder/)
  tapers from about 35% to 20%, and the published
  [Boreal Circle](https://www.garnstudio.com/pattern.php?cid=17&id=11414) and
  [Idun](https://www.garnstudio.com/pattern.php?cid=17&id=9209) schedules show
  how smaller increases can be distributed through a colourwork yoke.
- If the preferred bands would crowd a shallow yoke, use fewer, larger
  increases. Allow roughly one increase band per three available rounds where
  possible, but retain the minimum number needed to reach the target without
  more than doubling in any round. This is a band budget, not a guarantee of
  fixed spacing. The user can choose a different number or edit the schedule.
- Without a shoulder checkpoint, the curve uses `C(t) = neck + (end-neck)(2t-t²)`.
  Faster upper-yoke growth and tapering lower growth follow the qualitative
  guidance below. The exact quadratic (75% of growth halfway down) is OUR modelling
  assumption, not a measured fit law or a formula endorsed by the sources.
- An optional finished-fabric shoulder circumference and front length to that
  same line replace the estimate with two linear measured segments. Counts and
  lengths are rounded to repeat/round units. Both fields are required together,
  and must lie strictly within the endpoints with enough rounds for growth.
  This circumference includes both sleeve portions, not just torso or shoulder
  width. Using an existing well-fitting sweater avoids ambiguities in body tape
  paths. These measurements still do not describe a complete 3D body shape.
- Optional grouped schedules sample the same profile at the middle of each stitch
  jump, rather than spreading event times uniformly. With a checkpoint, groups
  are allocated to each measured segment and retain its target. Manual schedule
  edits can depart from that target. Internal arithmetic tests do not validate fit;
  comparisons against test-knitted designs and physical swatches remain necessary.
  The default also uses this midpoint placement rather than pretending its groups
  reproduce the continuous curve exactly. With a checkpoint, each segment gets
  its own derived band count. A custom round count remains available for motifs.
- Neckline short rows now include editable widening or narrowing symmetric turns, counted
  German double-stitch instructions and an unrolled turn map. They use the main
  colour before colourwork, without increases. The preview shows the partial
  courses at the back neckline. Knit Mode offers the written turns before the
  first colourwork sequence, then remembers that the chart has been started.
  It does not track the turns. See [short-row design notes](yoke-short-rows.md).
- Shaping events include editable per-repeat M1L/M1R output slots. Suggestions
  distribute new stitches among existing between-stitch gaps. Position text is
  one-based left-to-right; optional L/R suffixes select individual directions.
  Each slot is validated against the growth count, including repeat-boundary gaps.
  Moving only slots/directions preserves yarn cells. Kfb placement is not supported.
- Existing drafts retain their own schedules until the user explicitly calculates
  and applies another plan. Checkpoint fields are optional in version-1 files.
  Complete yokes now also round-trip through ordinary `.knitplot` files. The
  realistic knitted renderer is unchanged.
- Measurement changes over 5% from integer/repeat rounding require explicit
  confirmation before Apply. This is a UI review threshold, not a knitting fit
  tolerance. Viable alternative repeat counts with a closer neck opening are
  offered, showing their resulting body measurement too. Choosing one changes
  only the form; targets must be recalculated and applied deliberately.
- Need an entry path for counts from an existing pattern, not measurements only.
- Need measurement illustrations and shoulder/neckline fit controls, band-specific
  repeats, selection tools, and integration with Knit Mode.
- Changing the applied structure resets the drawing only after confirmation if
  there are painted cells; undo retains the prior project.
- Limits: 1,200 stitches around, 200 per repeat, 150 full rounds, 2–40 repeats.
  These limits are independent of the ordinary chart-maker limits.

## Shaping evidence and limits

- [Meg Swansen / Schoolhouse Press: standard and spiral baby yokes](https://www.schoolhousepress.com/media/wysiwyg/babyspiralhandout.pdf):
  primary example of EPS arithmetic, underarm accounting and substantial shaping
  rounds. This is a BABY example, not an adult grading dataset. We use its
  percentage-band principle, not its neckline proportion, depth or instructions.
- [Knit Picks: Elizabeth's Percentage System](https://tutorials.knitpicks.com/percentage-system/):
  body stitch count = finished body circumference × gauge; proportions are
  starting guidelines and can be replaced with actual measurements. Neither
  source supplies evidence of a specific population-wide fit success rate.
- [Holli Yeoh / Interweave: Circular Yoke Shaping](https://www.interweave.com/article/knitting-feature/circular-yoke-shaping/):
  upper-yoke shaping is generally faster, with more widely separated shaping
  rounds lower down; banded and wedge-integrated shaping are both valid. No
  universal shaping-round count or quantitative growth curve is given.
- [Tin Can Knits: design a Strange Brew yoke](https://blog.tincanknits.com/2018/11/09/how-to-design-a-strange-brew-yoke/)
  and [a worked example](https://blog.tincanknits.com/2021/01/28/the-simplest-strange-brew/):
  gauge/size-specific frameworks, movable shaping and motif compatibility.
  We have not inspected the complete paid pattern or copied its grading tables.
- [A knitter's Strange Brew adaptation](https://www.ravelry.com/projects/Mnberg/strange-brew)
  documents correct endpoints but excessive mid-yoke fabric, improved by moving
  shaping. [An Afmæli adaptation](https://www.ravelry.com/projects/calista/afmli-20-year-anniversary-sweater)
  documents depth and short-row adjustments. These are individual reports, not
  controlled validation. Overall pattern ratings are not fit-specific scores.
- The complete yoke remains drawable. No colourwork start/end region is imposed;
  the user decides where to paint motifs. Short rows remain separate metadata.

## Verification

`lib/yoke-plan.test.ts` covers arithmetic, rounding, units, short-row separation,
schedule consistency, immutable painting, file schema and rendering/hit-test
agreement. `e2e/yoke.spec.ts` exercises the real UI in the isolated localhost
harness; `e2e/editor.spec.ts` verifies the prototype is absent in production.
`lib/yoke-shaping.test.ts` covers curve quantization, checkpoint targets, unit
conversion, grouping and bounded growth across short and maximum-size plans.

## Hardening review

| Area                          | Assessment                             | Changes / remaining limits                                                                                                                                                                                               |
| ----------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Data safety / correctness     | Improved; targeted regressions covered | Flush pending drawing edits on App Router unmount, keep debounce separate from lifecycle handlers; never publish new candidate targets until their schedule also succeeds; reject a rounded split with no body stitches. |
| Resource safety / performance | Bounded                                | Position suggestions reject more than 200 stitches per repeat before allocating arrays, including incomplete manual schedule edits. Rounding suggestions are calculated once per candidate.                              |
| Security                      | Reuses existing chart routes           | Imported and saved yokes are validated, and cloud writes remain scoped to the chart owner and revision. This is not an independent security audit.                                                                       |
| Maintainability               | Small separated helpers                | Rounding calculations and review UI live outside the planner; draft flushing uses one stable save callback rather than duplicated write paths.                                                                           |

Regression tests exercise failed recalculations, pending edits during soft
navigation (with the debounce timer paused), rounding confirmation and alternatives,
and two-window protection.
Undoing/importing a smaller palette clamps the active brush to an available
colour, rather than leaving an invisible out-of-range selection that cannot paint.
The Chart maker link explicitly flushes before navigating; if storage fails, the
user can cancel leaving and download the current drawing. Unmount flushing is
also retained for other navigation paths, but cannot guarantee persistence if
the browser refuses storage; failure warnings and file download remain essential.

## Shared chart-maker integration

- File → New → Circular yoke opens the planner, then creates a normal workspace
  tab. Blank charts remain unchanged. Yokes use the existing history, browser
  workspace, project download and signed-in My Charts save paths.
- The chart document carries the full validated `yoke` project plus a derived
  one-repeat rectangular chart. Validation rejects inconsistent projections.
  Whole/half views retain independently painted repeats; rectangular exports are
  explicitly labelled repeat chart images. My Charts labels yoke projects.
- Gauge updates remeasure existing stitches without regenerating their yarn or
  shaping. Recalculating to preserve desired physical measurements is an explicit
  planning action, not a side effect of typing a gauge value.
- One repeat offers upright and sideways presentation plus Fit whole repeat.
  Orientation does not rotate document cells, stitch instructions or repeat order.
  The same inverse transform drives drawing and selection. Stitch labels stay
  upright. Interactive curved views support Space-drag (or middle-button) panning
  and Ctrl/Command-scroll zoom anchored at the pointer. These are local viewing
  controls, not design edits; bitmap rendering remains bounded independently of
  the displayed zoom.
- Edit shaping previews the original and proposal. Keep stitch size transfers
  centred yarn within each repeat, anchored at the neck; Scale design to fit uses
  nearest-neighbour sampling within each repeat. New repeats start blank. Symbols
  come from the new schedule rather than stretching the old shaping actions.
- Replanning creates a new tab and preserves the original, with capacity checks.
  Reviewed stitch edits can apply in place with undo or open a separate copy.
  A preview cannot commit if its source document changed while it was open.
- The cloud PUT guard rejects old clients that strip a saved yoke's metadata,
  even when their revision token matches. No database migration is needed.
- Knitted up renders the whole yoke as a top-down ring. Front and back show
  their portions of that same ring, rotated neckline-up; single repeats are
  laid out separately. It uses
  resolved stitches, the shared photographic texture, and the planned back-neck
  short rows. The panel starts open and renders the last preview snapshot; Refresh
  preview captures current edits. Switching views uses that same snapshot.
  File can download the rendered PNG for the selected view.
- Knit Mode compares yarn colours and worked actions across all rounds. Identical
  sections show one repeat; differing sections can be tracked individually in
  working order from centre back. Stitch math still covers the full round, and
  round, section and step survive reload.
- Instructions opens a printable yoke sheet with a colour key, back-neck short
  rows before Round 1, and written rounds with whole-round stitch counts.
  Identical repeats are listed once with a multiplier; other designs show a
  continuous sequence for each full round, in the same working order as Knit Mode.
- Knit Mode splits non-repeating yokes across the complete chart width, ignoring
  the original planning sections. It uses `ceil(width / limit)` balanced panels,
  differing by at most one column: 262 columns at a 100-column limit gives
  88, 87, 87. Identical repeats retain the repeat-based view. Boundaries stay
  fixed across rounds; the limit defaults to 100 and is adjustable from 50 to 200. This does not alter the saved design.
  The main Next button advances through populated display sections before
  offering Next round; empty sections are skipped. Jump controls are separate.
  Browsing sections within a round keeps the bookmark on its original stitch,
  even after resizing the display sections. Section size and viewed section are
  saved with progress; advancing to another round clears the old-round marker.
- `lib/yoke-document.test.ts` covers file/workspace round-trips, gauge stability
  and repeat-isolated transfer. `e2e/yoke-editor.spec.ts` covers shared-editor
  creation, painting/undo, gauge edits, view persistence, reshape forks, project
  reopen and cloud-save payloads. The real-Postgres suite checks the old-client
  overwrite guard against a disposable test database.

### Yoke drawing tools and repeat targeting

- Standard chart and One repeat display the explicitly selected repeat (numbered
  from the start of the round). With Edit all repeats off, only that repeat changes.
  Whole/Half views edit the actual clicked cells and highlight the selected repeat.
  Drawing on a different repeat selects it for the single-repeat views.
- Draw, Erase, connected-area Fill and Fill row section are distinct operations.
  Bucket fill follows contiguous fabric, not placeholder columns: horizontal
  neighbours are live stitches and adjacent rounds connect over overlapping stitch
  spans. A single-repeat view stays within its chosen repeat; all-repeat edits
  use the clicked repeat as the source region. Whole-yoke independent fills can
  cross the round seam. Coloured boundaries still stop filling.
  Select offers fill, copy/cut/paste, movement, horizontal/vertical flips and
  selection rotation in every view. These transform yarn, not shaping. Planned
  increase cells remain in place. Motifs cannot be moved into no-stitch space;
  nonexistent source cells are transparent in copied motifs.
- Selection coordinates follow the same ancestry-aware chart columns used by the
  standard chart, including when painted through curved views. A view/repeat/scope
  change clears the selection rather than reinterpreting it in another space.
- Curved views mark individual M1L/M1R cells and show surviving stitch connections
  across increase rounds. Decorative edge labels are omitted. At 100%, cells have
  at least 22px radial height and 24px arc width at their centres. Smaller zooms
  provide an overview. Empty margins are cropped and drawing can scroll both ways.
  The backing bitmap is bounded to 12 million pixels and 8192px per side; pointer
  mapping uses the logical viewport rather than the bounded backing resolution.
- `lib/yoke-editing.test.ts` covers repeat isolation, coordinate roundtrips, yarn-only
  transforms, transparent no-stitch cells, fill scopes and viewport hit testing.
  Browser tests cover non-first-repeat edits, selection tools and zoomed curved
  selection, and verify that the canvas draws increase labels rather than edge labels.
- Front/Back half views re-project the original back-centred short-row cells.
  The back centre has the extra courses; front-side portions are shown only where
  turn distances actually reach around the shoulders. Merely switching sides
  does not add or modify drawing data.
- Edit all repeats changes only future editing scope. When repeats differ, a short
  notice explains that their existing differences remain. Copy this repeat to all
  explicitly replaces yarn in every other repeat using the selected repeat, with
  confirmation and shared undo. It does not change the shaping schedule.
