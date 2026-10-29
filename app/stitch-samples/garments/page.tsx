import { notFound } from "next/navigation";
import { GarmentComparison } from "./comparison";
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <GarmentComparison />;
}
