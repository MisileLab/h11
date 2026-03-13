import { PaperDetailClient } from './client';

export default async function PaperPage({ params }: { params: Promise<{ arxiv_id: string }> }) {
  // Pass the ID to a client component because we need interactivity (saving, summary polling)
  // Decode in case of URL encoding
  const resolvedParams = await params;
  const decodedId = decodeURIComponent(resolvedParams.arxiv_id);
  
  return <PaperDetailClient arxivId={decodedId} />;
}
