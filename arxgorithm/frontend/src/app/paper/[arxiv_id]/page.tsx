import { PaperDetailClient } from './client';

export default function PaperPage({ params }: { params: { arxiv_id: string } }) {
  // Pass the ID to a client component because we need interactivity (saving, summary polling)
  // Decode in case of URL encoding
  const decodedId = decodeURIComponent(params.arxiv_id);
  
  return <PaperDetailClient arxivId={decodedId} />;
}
