import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { api } from '@/lib/api';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ account }) {
      if (account?.provider === 'google' && account.id_token) {
        try {
          const response = await api.auth.googleAuth(account.id_token);
          const { access_token, refresh_token } = response.data;

          if (typeof window !== 'undefined') {
            localStorage.setItem('access_token', access_token);
            localStorage.setItem('refresh_token', refresh_token);
          }

          return true;
        } catch (error) {
          console.error('Backend auth failed:', error);
          return false;
        }
      }
      return true;
    },
    async jwt({ token, account }) {
      if (account?.id_token) {
        token.idToken = account.id_token;
      }
      return token;
    },
    async session({ session, token }) {
      return session;
    },
  },
  pages: {
    signIn: '/',
    error: '/auth/error',
  },
  secret: process.env.NEXTAUTH_SECRET,
});
