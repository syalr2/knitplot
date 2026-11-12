import { z } from "zod";

export const MAX_GAUGE_VALUE = 100;
export const gaugeMeasurementSchema = z
  .number()
  .positive()
  .max(MAX_GAUGE_VALUE);
