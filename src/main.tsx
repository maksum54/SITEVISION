import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import './index.css'
import { LanguageProvider } from './i18n'
import { LoginPage } from './pages/LoginPage'
import { RequireAuth } from './pages/AppLayout'
import { ProjectsPage } from './pages/ProjectsPage'
import { PlansPage } from './pages/PlansPage'
import { PlanViewerPage } from './pages/PlanViewerPage'
import { PunchListPage } from './pages/PunchListPage'
import { AdminTabs, RequireAdmin } from './pages/admin/AdminLayout'
import { AdminUsersPage } from './pages/admin/AdminUsersPage'
import { AdminProjectsPage } from './pages/admin/AdminProjectsPage'
import { AdminPhotosPage } from './pages/admin/AdminPhotosPage'
import { AdminCategoriesPage } from './pages/admin/AdminCategoriesPage'
import { AdminStoragePage } from './pages/admin/AdminStoragePage'

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      { index: true, element: <ProjectsPage /> },
      { path: 'projects/:projectId', element: <PlansPage /> },
      { path: 'projects/:projectId/plans/:planId', element: <PlanViewerPage /> },
      { path: 'projects/:projectId/plans/:planId/punchlist', element: <PunchListPage /> },
      {
        path: 'admin',
        element: <RequireAdmin />,
        children: [
          {
            element: <AdminTabs />,
            children: [
              { index: true, element: <Navigate to="users" replace /> },
              { path: 'users', element: <AdminUsersPage /> },
              { path: 'projects', element: <AdminProjectsPage /> },
              { path: 'photos', element: <AdminPhotosPage /> },
              { path: 'categories', element: <AdminCategoriesPage /> },
              { path: 'storage', element: <AdminStoragePage /> },
            ],
          },
        ],
      },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <RouterProvider router={router} />
    </LanguageProvider>
  </StrictMode>,
)
