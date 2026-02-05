'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { LogOut, Search, User } from 'lucide-react';
import { useState } from 'react';

export function Header() {
  const { session, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const [showDropdown, setShowDropdown] = useState(false);

  if (!isAuthenticated) return null;

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="text-xl font-bold">
            Corin
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <Link
              href="/dashboard"
              className={`text-sm font-medium transition-colors hover:text-primary ${
                pathname === '/dashboard'
                  ? 'text-foreground'
                  : 'text-muted-foreground'
              }`}
            >
              Dashboard
            </Link>
            <Link
              href="/search"
              className={`text-sm font-medium transition-colors hover:text-primary ${
                pathname === '/search'
                  ? 'text-foreground'
                  : 'text-muted-foreground'
              }`}
            >
              Search
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <Link href="/search">
            <Button variant="ghost" size="icon">
              <Search className="h-5 w-5" />
            </Button>
          </Link>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              {session?.user?.image ? (
                <img
                  src={session.user.image}
                  alt={session.user.name || ''}
                  className="h-8 w-8 rounded-full"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                  <User className="h-5 w-5 text-primary-foreground" />
                </div>
              )}
            </button>

            {showDropdown && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10"
                  onClick={() => setShowDropdown(false)}
                  aria-label="Close dropdown"
                />
                <div className="absolute right-0 mt-2 w-48 bg-popover border rounded-md shadow-lg z-20">
                  <div className="p-2 border-b">
                    <p className="text-sm font-medium">{session?.user?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {session?.user?.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: '/' })}
                    className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-accent rounded-md"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
