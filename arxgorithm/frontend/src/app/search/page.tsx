import { SearchPageClient } from './search-page-client';

interface SearchPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const initialQuery = resolvedSearchParams.q;

  return (
    <SearchPageClient
      initialQuery={typeof initialQuery === 'string' ? initialQuery : ''}
    />
  );
}
