import { getViewer } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { createChartLinkHandlers } from "@/lib/chart-link-handlers";

const handlers = createChartLinkHandlers({ getViewer, getDatabase });
export const POST = handlers.create;
export const DELETE = handlers.revoke;
