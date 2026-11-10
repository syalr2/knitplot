import { notFound } from "next/navigation";
import { YokeDesigner } from "@/components/yoke-designer";
import "./yoke.css";

export default function YokeDesignerPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <YokeDesigner />;
}
