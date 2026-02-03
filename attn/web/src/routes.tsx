import { createRootRouteWithContext, createRoute, Outlet, redirect } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api.ts'

// Define context type
interface MyRouterContext {
  queryClient: QueryClient
}

// Root Route
export const rootRoute = createRootRouteWithContext<MyRouterContext>()({
  component: () => <Outlet />,
})

// Setup Route
import { SetupPage } from '@/pages/Setup.tsx'
export const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'setup',
  component: SetupPage,
})

// Login Route
import { LoginPage } from '@/pages/Login.tsx'
export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'login',
  component: LoginPage,
})

// Protected Layout
import { AppLayout } from '@/pages/Layout.tsx'
export const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: AppLayout,
  beforeLoad: async ({ context }) => {
    // Check if setup is complete
    try {
      const { data: status } = await api.get('/setup/status')
      if (!status.is_setup) {
        throw redirect({ to: '/setup' })
      }
    } catch (e) {
      // If setup check fails (network?), might want to retry or allow.
      // Assuming 200 OK means we can proceed to check auth.
    }

    // Check auth
    try {
      await api.get('/me')
    } catch (e) {
      throw redirect({ to: '/login' })
    }
  },
})

// Dashboard
import { DashboardPage } from '@/pages/Dashboard.tsx'
export const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: DashboardPage,
})

// Workspace
import { WorkspacePage } from '@/pages/Workspace.tsx'
export const workspaceRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'workspace/$workspaceId',
  component: WorkspacePage,
})

// Settings
import { SettingsPage } from '@/pages/Settings.tsx'
export const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'settings',
  component: SettingsPage,
})

export const routeTree = rootRoute.addChildren([
  setupRoute,
  loginRoute,
  appRoute.addChildren([
    dashboardRoute,
    workspaceRoute,
    settingsRoute,
  ]),
])
