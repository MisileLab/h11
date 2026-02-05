import { 
  createRouter, 
  createRoute, 
  createRootRoute, 
  Outlet, 
  redirect 
} from '@tanstack/react-router';
import { Layout } from './components/layout/Layout';
import { DashboardPage } from './pages/Dashboard';
import { LoginPage } from './pages/Login';
import { SetupPage } from './pages/Setup';
import { SettingsPage } from './pages/Settings';
import { GithubPage } from './pages/Github';
import { WorkspaceDetailPage } from './pages/WorkspaceDetail';
import { api } from './api/client';

// Root (Outlet)
const appRoot = createRootRoute({
  component: Outlet,
});

// Main App Layout (Authenticated)
const mainLayout = createRoute({
  getParentRoute: () => appRoot,
  id: 'app',
  component: () => <Layout><Outlet /></Layout>,
  beforeLoad: async ({ location }) => {
    try {
      // 1. Check if setup is needed
      const setup = await api.getSetupStatus();
      if (!setup.is_setup) {
        throw redirect({ to: '/setup' });
      }
      // 2. Check if logged in
      await api.getMe();
    } catch (err: any) {
      if (err.isRedirect) throw err;
      // If error (401), redirect to login
      throw redirect({ 
        to: '/login', 
        search: { redirect: location.href } 
      });
    }
  },
});

const indexRoute = createRoute({
  getParentRoute: () => mainLayout,
  path: '/',
  component: DashboardPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => mainLayout,
  path: '/settings',
  component: SettingsPage,
});

const githubRoute = createRoute({
  getParentRoute: () => mainLayout,
  path: '/github',
  component: GithubPage,
});

const workspaceRoute = createRoute({
  getParentRoute: () => mainLayout,
  path: '/workspaces/$workspaceId',
  component: WorkspaceDetailPage,
});

// Auth Layout (No sidebar)
const authLayout = createRoute({
  getParentRoute: () => appRoot,
  id: 'auth',
  component: Outlet,
});

const loginRoute = createRoute({
  getParentRoute: () => authLayout,
  path: '/login',
  component: LoginPage,
  beforeLoad: async () => {
    // If already logged in, redirect to dashboard?
    // Optional, but good UX.
    // Also check setup status.
    const status = await api.getSetupStatus();
    if (!status.is_setup) {
      throw redirect({ to: '/setup' });
    }
  }
});

const setupRoute = createRoute({
  getParentRoute: () => authLayout,
  path: '/setup',
  component: SetupPage,
  beforeLoad: async () => {
    const status = await api.getSetupStatus();
    if (status.is_setup) {
      throw redirect({ to: '/login' });
    }
  }
});

// Route Tree
const routeTree = appRoot.addChildren([
  mainLayout.addChildren([
    indexRoute,
    settingsRoute,
    githubRoute,
    workspaceRoute,
  ]),
  authLayout.addChildren([
    loginRoute,
    setupRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
