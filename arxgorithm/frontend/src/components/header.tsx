import Link from 'next/link';
import { AuthMenu } from './auth-menu';

export function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-gray-200 bg-white/80 backdrop-blur-md">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 text-white rounded flex items-center justify-center font-bold text-xl">
            A
          </div>
          <span className="font-bold text-xl tracking-tight hidden sm:inline-block">
            Arxgorithm
          </span>
        </Link>
        <div className="flex items-center gap-4">
          {/* Add a search bar or navigation links here if needed later */}
          <AuthMenu />
        </div>
      </div>
    </header>
  );
}
