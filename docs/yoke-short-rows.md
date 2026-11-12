# Neckline short rows

The design page shows turn controls and a map only, with no technique tutorial or external links. The instruction generator is retained for the future dedicated printable/written instructions view; it is not currently exposed in the designer.

The development workspace offers German short-row instructions before colourwork, using the applied neck count and back-neck height. The beginning-of-round marker is at centre back (column zero of the whole-yoke drawing). Each pair adds two rows at centre back without changing stitch counts. Main-colour short rows remain separate from the editable full-round chart. The closing full round resolves the remaining double stitches and is chart round 1, using its chart colours—not an extra round added to the yoke length.

## Suggested spread

Suggested turns widen symmetrically from approximately 60% to 80% of the total neck stitches, following Wise Owl Knits' published before-colourwork recipe. Each side's first distance is rounded from 30% of the neck count; its final distance is rounded from 40%, with intermediate pairs interpolated between them. One pair uses the first distance. Suggested turns are at least three stitches apart. If the requested pair count cannot fit that spread, the UI offers manual distances instead of silently changing the coverage or height. This is a documented design recipe, not a fit guarantee derived from shoulder anatomy.

Manual distances may consistently increase (widening) or decrease (narrowing). Repeated turns, mixed directions, spacing below two stitches and turns crossing centre front are rejected. Two-stitch spacing remains available manually, preserving existing saved setups. Wider spacing is a suggestion rather than a universal knitting constraint. Old saved custom distances are never replaced merely because suggestions change.

Distances include the final worked stitch before turning. That stitch is slipped to make the German double stitch, so it is excluded from the following K/P count. Tests simulate needle movement and count work on both sides of centre back. Double stitches always count as one existing stitch, not an increase.

## Persistence and scope

Custom distances are optional validated project data, preserved by download/import, undo/redo and browser storage. Older files use suggested positions without being rewritten merely for the new field. A measurement change that changes neck count or pair count drops incompatible custom turns; equivalent plans retain them. Draft turn edits do not affect the chart or stored project until explicitly saved.

This first version uses one consistent blocked gauge, centre-back start of round, main-colour stockinette and no increases within the short rows. Placement remains immediately below the neckline, before colourwork. Whole yoke view shows two partial main-colour courses per pair inside the round-one boundary. Active courses are packed against that boundary at each neck stitch, so either turn direction stays connected without blank gaps. Rendering cannot shrink the visible neck opening below 35 canvas units. Full-round geometry and hit testing are unchanged; partial rows are not paintable. This is a design projection, not a fabric or fit simulation. The knitted preview includes the partial courses. Knit Mode makes their written instructions available before Round 1 without tracking individual turns.

## Sources

[Wise Owl Knits: Add Short Rows to Any Pattern](https://wiseowlknits.com/blogs/new/add-short-rows-to-any-pattern) supplies the suggested 60–80% coverage and preference for at least three stitches between turns. [Tin Can Knits: German short rows](https://blog.tincanknits.com/2015/05/14/german-short-rows/) and [Purl Soho: German short rows](https://www.purlsoho.com/create/german-short-rows/) establish the technique and turn-count convention. These references are maintained in development documentation only, not linked from the design page.
