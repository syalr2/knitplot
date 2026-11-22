import { getViewer } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import { createChartLinkHandlers } from "@/lib/chart-link-handlers";

export const POST = createChartLinkHandlers({ getViewer, getDatabase }).open;
