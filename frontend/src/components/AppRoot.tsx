import { Outlet } from 'react-router-dom'
import { useAppearanceSync } from '../auth/useAppearanceSync'
import { RouteProgress } from './RouteProgress'

/** Above every route, so the chosen colours apply on public pages too. */
export function AppRoot() {
  useAppearanceSync()
  return (
    <>
      <RouteProgress />
      <Outlet />
    </>
  )
}
