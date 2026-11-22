import { getDatabase } from "@/lib/db";
import { createDraftChartLinkHandlers } from "@/lib/draft-chart-link-handlers";

export const { POST, DELETE } = createDraftChartLinkHandlers(getDatabase);
