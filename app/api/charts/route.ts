import { getViewer } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { createChartHandlers } from "@/lib/chart-route-handlers";

const handlers = createChartHandlers({ getViewer, getDatabase });
export const POST = handlers.POST;
