import { RecommendationFeed } from '@/components/home/recommendation-feed';

export default function Home() {
  return (
    <main className="flex-grow container mx-auto px-4 py-8 max-w-4xl flex flex-col min-h-[80vh]">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Arxgorithm</h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          A modern interface for discovering, summarizing, and reading arXiv papers.
        </p>
      </div>
      
      <RecommendationFeed />
    </main>
  );
}
