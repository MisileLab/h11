import { HomeSearchHero } from '@/components/home/home-search-hero';
import { RecommendationFeed } from '@/components/home/recommendation-feed';

export default function Home() {
  return (
    <main className="flex-grow container mx-auto px-4 py-8 max-w-4xl flex flex-col min-h-[80vh]">
      <HomeSearchHero />
      <RecommendationFeed />
    </main>
  );
}
