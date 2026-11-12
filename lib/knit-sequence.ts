import {
  stitchActionLabel,
  type ChartDocument,
  type rowStitchSteps,
} from "./chart";

type WorkedStep = Pick<
  ReturnType<typeof rowStitchSteps>[number],
  "action" | "colorId"
>;
type SequenceContext = Pick<ChartDocument, "palette"> & {
  instructions: Pick<ChartDocument["instructions"], "technique">;
};

function yarnLabel(document: SequenceContext, colorId: string) {
  const index = document.palette.findIndex(({ id }) => id === colorId);
  return index === 0 ? "MC" : index > 0 ? `CC${index}` : "?";
}

export function workedStepLabel(
  document: SequenceContext,
  step: WorkedStep,
  yoke: boolean,
) {
  const yarn = yarnLabel(document, step.colorId);
  if (step.action === "knit")
    return yarn === "MC" && document.instructions.technique === "duplicate"
      ? "Skip"
      : yarn;
  const stitch = stitchActionLabel(step.action);
  return yoke && yarn !== "MC" ? `${stitch}(${yarn})` : stitch;
}

export function rowSequence(
  document: SequenceContext,
  ordered: WorkedStep[],
  yoke: boolean,
) {
  return ordered.reduce<
    Array<{
      action: WorkedStep["action"];
      colorId: string;
      label: string;
      count: number;
      showCount: boolean;
    }>
  >((runs, step) => {
    if (step.action !== "knit") {
      const isEdgeAction =
        step.action === "cast-on" || step.action === "bind-off";
      const previous = runs[runs.length - 1];
      if (
        isEdgeAction &&
        previous?.action === step.action &&
        (!yoke || previous.colorId === step.colorId)
      )
        previous.count += 1;
      else
        runs.push({
          action: step.action,
          colorId: step.colorId,
          label: workedStepLabel(document, step, yoke),
          count: 1,
          showCount: isEdgeAction,
        });
      return runs;
    }
    const previous = runs[runs.length - 1];
    if (previous?.action === "knit" && previous.colorId === step.colorId)
      previous.count += 1;
    else
      runs.push({
        action: step.action,
        colorId: step.colorId,
        label: workedStepLabel(document, step, yoke),
        count: 1,
        showCount: true,
      });
    return runs;
  }, []);
}
