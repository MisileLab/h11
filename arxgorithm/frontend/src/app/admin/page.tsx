import { Metadata } from 'next';
import { AdminClient } from './client';

export const metadata: Metadata = {
  title: 'Admin - Arxgorithm',
  description: 'Admin dashboard for Arxgorithm',
};

export default function AdminPage() {
  return <AdminClient />;
}
