import { useIsFetching } from '@tanstack/react-query'
import NProgress from 'nprogress'
import { useEffect, useRef } from 'react'
import { useLocation, useNavigation } from 'react-router-dom'

NProgress.configure({ showSpinner: false, minimum: 0.15, trickleSpeed: 150 })

/** Long enough to be seen when a screen opens instantly from cache. */
const MINIMUM_VISIBLE_MS = 250

/**
 * The bar at the top while another screen opens: its code downloading, then its first data arriving.
 * Background refreshes and prefetches have nobody waiting for them, so they do not count.
 */
export function RouteProgress() {
  const { pathname } = useLocation()
  const navigating = useNavigation().state !== 'idle'
  const firstLoads = useIsFetching({
    predicate: (query) => query.state.data === undefined && query.getObserversCount() > 0,
  })
  const busy = navigating || firstLoads > 0

  const busyNow = useRef(busy)
  const holding = useRef(false)

  useEffect(() => {
    busyNow.current = busy
    if (busy) NProgress.start()
    else if (!holding.current) NProgress.done()
  }, [busy])

  useEffect(() => {
    holding.current = true
    NProgress.start()
    const timer = setTimeout(() => {
      holding.current = false
      if (!busyNow.current) NProgress.done()
    }, MINIMUM_VISIBLE_MS)
    return () => {
      clearTimeout(timer)
      holding.current = false
    }
  }, [pathname])

  return null
}
