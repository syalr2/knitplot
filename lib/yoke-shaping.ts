type Targets = {
  neck: number;
  end: number;
  rounds: number;
  shoulder?: { count: number; round: number };
};

/**
 * Estimated upper-heavy profile: 75% of growth by halfway down the yoke.
 * This quadratic is our explicit modelling assumption, not a published fit formula.
 * An optional finished-fabric checkpoint replaces it with two measured slopes.
 */
export function targetStitches(plan: Targets, round: number) {
  const { neck, end, rounds, shoulder } = plan;
  if (shoulder) {
    return round <= shoulder.round
      ? neck + ((shoulder.count - neck) * (round - 1)) / (shoulder.round - 1)
      : shoulder.count +
          ((end - shoulder.count) * (round - shoulder.round)) /
            (rounds - shoulder.round);
  }
  const t = (round - 1) / (rounds - 1);
  return neck + (end - neck) * (2 * t - t * t);
}

export function shapingSchedule(
  plan: Targets,
  repeats: number,
  requested?: number,
) {
  const start = plan.neck / repeats;
  const end = plan.end / repeats;
  if (requested === undefined) {
    if (!plan.shoulder) return baseSchedule(plan, repeats, false);
    const checkpoint = plan.shoulder;
    return [
      ...baseSchedule(
        { neck: plan.neck, end: checkpoint.count, rounds: checkpoint.round },
        repeats,
        true,
      ),
      ...baseSchedule(
        {
          neck: checkpoint.count,
          end: plan.end,
          rounds: plan.rounds - checkpoint.round + 1,
        },
        repeats,
        true,
      ).map((event) => ({
        ...event,
        round: event.round + checkpoint.round - 1,
      })),
    ];
  }
  const stages = Math.min(
    plan.rounds - 1,
    end - start,
    Math.max(requested, Math.ceil(Math.log2(end / start))),
  );
  if (plan.shoulder) {
    const left = {
      neck: plan.neck,
      end: plan.shoulder.count,
      rounds: plan.shoulder.round,
    };
    const right = {
      neck: plan.shoulder.count,
      end: plan.end,
      rounds: plan.rounds - plan.shoulder.round + 1,
    };
    const minimum = (part: Targets) =>
      Math.ceil(Math.log2(part.end / part.neck));
    const maximum = (part: Targets) =>
      Math.min(part.rounds - 1, (part.end - part.neck) / repeats);
    const low = Math.max(minimum(left), stages - maximum(right));
    const high = Math.min(maximum(left), stages - minimum(right));
    if (low > high)
      throw new Error(
        `Choose at least ${minimum(left) + minimum(right)} increase rounds to retain the shoulder checkpoint.`,
      );
    const leftStages = Math.max(
      low,
      Math.min(
        high,
        Math.round((stages * (left.end - left.neck)) / (plan.end - plan.neck)),
      ),
    );
    // Each measured segment is linear, so group it on that same slope.
    return [
      ...groupedSchedule(left, repeats, leftStages, true),
      ...groupedSchedule(right, repeats, stages - leftStages, true).map(
        (event) => ({
          ...event,
          round: event.round + plan.shoulder!.round - 1,
        }),
      ),
    ];
  }
  return groupedSchedule(plan, repeats, stages, false);
}

/** Smaller bands for colourwork, tapering with progress through the planned
 * growth. The percentages are KnitPlot defaults, not a fit formula. */
function baseSchedule(plan: Targets, repeats: number, linear: boolean) {
  const start = plan.neck / repeats;
  const end = plan.end / repeats;
  let count = start;
  const counts: number[] = [];
  while (count < end) {
    const progress = (count - start) / (end - start);
    const increase = Math.max(1, Math.floor(count * (0.25 - 0.1 * progress)));
    count = Math.min(end, count + increase);
    counts.push(count);
  }
  if (counts.length > 1) {
    const penultimate = counts.length - 2;
    const before = counts[penultimate - 1] ?? start;
    // Avoid a nearly empty cleanup round after a larger lower-yoke increase.
    if ((end - counts[penultimate]) * 2 < counts[penultimate] - before)
      counts[penultimate] = end - Math.max(1, Math.floor((end - before) * 0.4));
  }
  // Prefer room for plain rounds, but never reject a valid shallow yoke.
  // A tight segment may require larger steps or, at the limit, adjacent rounds.
  const budget = Math.max(
    Math.ceil(Math.log2(end / start)),
    Math.floor((plan.rounds - 1) / 3),
  );
  return counts.length > budget
    ? groupedSchedule(plan, repeats, budget, linear)
    : placeBands(plan, repeats, counts, linear);
}

function groupedSchedule(
  plan: Targets,
  repeats: number,
  stages: number,
  linear: boolean,
) {
  const start = plan.neck / repeats,
    end = plan.end / repeats;
  const counts: number[] = [];
  let before = start;
  const required = [end];
  for (let i = 1; i < stages; i++) required.unshift(Math.ceil(required[0] / 2));
  for (let index = 0; index < stages; index++) {
    const remaining = stages - index - 1;
    const count = Math.min(
      before * 2,
      end - remaining,
      Math.max(
        before + 1,
        Math.round(start + ((end - start) * (index + 1)) / stages),
        required[index],
      ),
    );
    counts.push(count);
    before = count;
  }
  return placeBands(plan, repeats, counts, linear);
}

function placeBands(
  plan: Targets,
  repeats: number,
  counts: number[],
  linear: boolean,
) {
  const start = plan.neck / repeats;
  const end = plan.end / repeats;
  let before = start;
  let previousRound = 1;
  return counts.map((count, index) => {
    const remaining = counts.length - index - 1;
    // A grouped increase straddles its ideal curve crossing. Invert the
    // quadratic at the midpoint of the stitch jump to minimise staircase error.
    const fraction = ((before + count) / 2 - start) / (end - start);
    const t = linear ? fraction : 1 - Math.sqrt(1 - fraction);
    const round = Math.min(
      plan.rounds - remaining,
      Math.max(previousRound + 1, Math.round(1 + t * (plan.rounds - 1))),
    );
    before = count;
    previousRound = round;
    return { round, count: count * repeats };
  });
}
