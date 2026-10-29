import { getViewer } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { createChartHandlers } from "@/lib/chart-route-handlers";

const handlers = createChartHandlers({ getViewer, getDatabase });
export const GET = handlers.GET;
export const PUT = handlers.PUT;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
