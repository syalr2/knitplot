# Independent yoke shaping: count-engine review

Status (2026-11-10): connected to the main yoke editor, with validated version-2
yoke documents. Existing version-1 yokes still open normally. The count workbench
remains an isolated development diagnostic, not a second saved workflow. The
realistic knitted renderer and ordinary chart documents are unchanged.

## Why a separate instruction model

The original planner has one increase-only schedule, with equal counts in every
repeat. Colour editing can differ independently, but that model cannot represent
one repeat with an extra increase, a decrease, kfb or a bind-off correctly.

`YokeStitchProgram` represents knitting instructions per round and repeat. Each
instruction consumes and produces the counts from the same `stitchActionMath`
used by regular charts. Its output loops carry stable IDs, original yarn colours
and input-loop references. Instructions and output stitches are not interchangeable:
one kfb instruction produces two loops; BO consumes one and produces none.

`yokeProgramFromProject` converts existing planned yokes without changing their
output colours, counts or M1 directions. There is no automatic migration or write.

## Revision semantics

- M1 and CO add an instruction before the clicked existing stitch, preserving
  that stitch. They do not turn a consumed knit stitch into a zero-input increase.
- kfb/Inc replace the clicked one-input instruction with a two-output instruction.
- Decreases consume additional adjacent knit/purl inputs in the same repeat.
  A decrease that crosses the repeat edge or overlaps shaping is refused.
- BO consumes the clicked stitch and removes its output from following rounds.
- No stitch inserts a chart placeholder. It does not bind off a real loop or
  create a hole in the fabric. Removing an inserted increase removes its new
  column and descendants, not an arbitrary neighbouring column.
- Purl changes the action without changing the count. The eventual knitted view
  must continue to use the agreed convention that explicit purl means a bump.
- Later ordinary instructions follow their original loop IDs. Newly created
  loops receive ordinary continuation instructions in their correct relative
  place; descendants of removed loops disappear. Remaining colour columns keep
  their identities, rather than resampling the whole motif.
- If a later shaping instruction loses necessary inputs, the revision is refused
  with a targeted error instead of silently substituting other stitches.
- All-repeat changes target matching instruction indices in each repeat in both
  the workbench and main editor; an absent target is refused. With Edit all
  repeats off, only the selected repeat changes, even when widths differ.

## Verification and remaining integration

Unit regressions cover every existing stitch type, independent/all-repeat counts,
unchanged neighbours and source data, repeated revisions, removal of an increase,
ambiguous overlaps, invalid IDs/actions, bounds and lossless planner conversion.

## Main-editor integration

- The normal Stitches panel is available for yokes, including display colours,
  Use yarn colour, Remove stitch, purl, increases, decreases, CO and BO.
- Plain knit/purl changes commit in place with normal undo when no shaping is
  pending. Structural strokes accumulate as pending symbols on unchanged geometry.
  Review shaping changes validates the combined batch and opens the
  original/proposed preview. Apply changes updates the current tab with a single
  normal undo step; Create a separate copy optionally preserves the original in
  another tab. Only the copy option needs a free tab. Closing the
  preview keeps the batch, while Discard removes it. Pending batches have their
  own undo/redo and remain available when switching chart tabs in this session.
  They are not included in saved files until confirmed; leaving the page warns
  about unapplied work.
  Cancelling, a stale source, or a full workspace never discards the source.
- Undo/redo restores historical knitting in the current stitch-program format.
  Older planner snapshots are converted losslessly when restored, so undo cannot
  trip the cloud API's deliberate old-client format-downgrade protection.
- The chart follows loop ancestry into stable columns. Each repeat may have its
  own chart width and output count. Whole/Half/One repeat views share the same
  geometry for drawing and hit testing; bind-off gaps remain explicit openings.
  CO can close an opening; a no-stitch placeholder cannot create one.
- Colours remain independently editable with normal selection tools. Copying
  colours across unequal repeats fits the colours to their existing shapes;
  it does not silently change their shaping.
- Per-instruction display overrides can explicitly follow yarn, even when a
  global stitch-display colour is selected. Changing/resetting the global
  display colour clears individual overrides, matching ordinary charts.
- Replanning a hand-edited yoke explicitly resets its custom instruction plan in
  a new tab, transferring yarn per repeat and leaving the old yoke untouched.

## Persistence and rollout

Version-2 yokes carry their stitch program and an exact derived first-repeat
chart. Validation checks both, their colour data, the initial neck count, and
the repeat/round settings. Version-1 documents with old empty stitch palettes
remain compatible. Older clients cannot downgrade a version-2 cloud chart,
even with a matching revision token.

File, browser, API and database serialization share a versioned compact instruction
encoding (`knitplot-stitches-1`). IDs remain stable; action codes are append-only.
The decoder bounds nested collections before expanding them and passes decoded
instructions through the same validation. Ordinary document serialization is
unchanged. A 1,170-stitch, 150-round fixture is checked against a 4 MB upload budget.

Resolved-program and surface caches retain at most three models each, so the
undo stack cannot retain an unbounded set of heavy geometry caches. No database
migration, additional telemetry, or new API-key handling is involved.

The photographic preview feeds resolved loop ancestry directly into the existing
connected fabric renderer, without treating the first repeat as the whole yoke.
No-stitch placeholders contribute no yarn; bind-off edges and openings remain
visible. Short rows are shown as partial stockinette courses at the back neck.
Rendering is on demand, with bounded worker layout and bitmap dimensions. The
laid-out preview is not a garment fit simulation.

Still separate follow-up work:

1. Connect complete yokes to Knit Mode and printable instructions.
2. Consider multi-edit recovery UI when a change invalidates a later shaping
   instruction; currently the source is kept and a clear error is shown.
