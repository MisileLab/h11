import { ScrapeForm } from "./components/ScrapeForm";

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-5xl mx-auto flex flex-col gap-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4 tracking-tight">Review Scraper</h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Extract and download Google Play Store reviews instantly.
          </p>
        </div>
        
        <ScrapeForm />
      </div>
    </div>
  );
}
