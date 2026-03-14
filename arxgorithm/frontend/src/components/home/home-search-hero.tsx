'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SearchInput } from '@/components/search/search-input';

export function HomeSearchHero() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  return (
    <section className="mb-10 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700 ring-1 ring-inset ring-blue-200">
          Search powers recommendations
        </span>
        <h1 className="mt-4 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          Arxgorithm
        </h1>
        <p className="mt-4 text-base leading-7 text-gray-600 sm:text-lg">
          Search arXiv papers first, then save interesting ones to your reading list.
          That history is what the recommendation engine uses to personalize your feed.
        </p>
      </div>

      <form
        className="mx-auto mt-8 flex max-w-3xl flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();

          const normalizedQuery = query.trim();
          if (!normalizedQuery) {
            router.push('/search');
            return;
          }

          router.push(`/search?q=${encodeURIComponent(normalizedQuery)}`);
        }}
      >
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search topics like transformers, diffusion, or RLHF"
        />
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
        >
          Search papers
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm text-gray-500">
        <span>Try:</span>
        {['large language models', 'computer vision', 'robotics'].map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="rounded-full border border-gray-200 px-3 py-1 transition hover:border-blue-300 hover:text-blue-700"
            onClick={() => router.push(`/search?q=${encodeURIComponent(suggestion)}`)}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </section>
  );
}
