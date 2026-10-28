import { notFound } from "next/navigation";
import { StartingPoseComparison } from "./comparison";

export default function Page() {
  if(process.env.NODE_ENV!=="development") notFound();
  return <StartingPoseComparison/>;
}
