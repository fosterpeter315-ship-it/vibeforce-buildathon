import { ResultsView } from "@/components/ResultsView";

export default async function SearchResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ResultsView searchId={id} />;
}
