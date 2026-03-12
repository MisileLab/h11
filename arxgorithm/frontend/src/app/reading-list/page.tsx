import { Metadata } from 'next';
import { ReadingListClient } from './client';

export const metadata: Metadata = {
  title: 'Reading List - Arxgorithm',
  description: 'Your saved arXiv papers',
};

export default function ReadingListPage() {
  return <ReadingListClient />;
}
