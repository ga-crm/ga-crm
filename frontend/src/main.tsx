import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { Toaster, TooltipProvider } from './components/ui'
import './index.css'
import { setUnauthenticatedHandler } from './lib/api'
import { t } from './i18n'
import { keys } from './lib/queries'
import { queryClient, setSessionUser } from './lib/queryClient'
import { toast } from './lib/toast'
import { applyAppearance, readCachedAppearance } from './lib/theme'
import { router } from './router'

applyAppearance(readCachedAppearance())

// A session can end at any time (disabled user, suspended GA): RequireAuth then redirects to /login.
setUnauthenticatedHandler(() => {
  // Only for someone who was signed in; a first visit to the site also gets a 401
  if (queryClient.getQueryData(keys.me)) toast.warning(t('toast.sessionExpired'), t('toast.sessionExpiredDetail'))
  setSessionUser(null)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* A short wait, so tooltips do not flash while the pointer crosses the screen */}
      <TooltipProvider delayDuration={300}>
        <RouterProvider router={router} />
      </TooltipProvider>
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
)
