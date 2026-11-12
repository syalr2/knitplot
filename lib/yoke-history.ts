import type { ChartDocument } from "./chart";
import { readChartDocument } from "./chart-schema";
import { yokeDocument } from "./yoke-document";
import { yokeProgramFromProject } from "./yoke-program-from-project";
import { withYokeProgram } from "./yoke-program-state";

/** Restore knitting, not an obsolete wire format: cloud saves deliberately
 * reject format downgrades from clients that cannot understand stitch programs. */
export function restoreYokeHistoryDocument(
  current: ChartDocument,
  target: ChartDocument,
) {
  if (!current.yoke?.program || !target.yoke || target.yoke.program)
    return target;
  return readChartDocument({
    ...target,
    ...yokeDocument(
      withYokeProgram(target.yoke, yokeProgramFromProject(target.yoke)),
      target.name,
    ),
    instructions: target.instructions,
    guides: target.guides,
  });
}
