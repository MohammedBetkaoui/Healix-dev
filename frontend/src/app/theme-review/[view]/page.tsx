import { notFound } from "next/navigation";
import { ThemeReview } from "../ThemeReview";

export default async function Page({ params }: { params: Promise<{ view: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { view } = await params;
  return <ThemeReview view={view} />;
}
