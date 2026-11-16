import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

const DEFAULT_PAGE_SIZE = 25
const PAGE_SIZES = [10, 25, 50]

type Patch = Record<string, string | number | null>

/**
 * Screen state lives in the URL so a reload, a shared link or the back button returns to the same place.
 * Keep it to what is safe in a URL: never passwords, and never links holding a one-time token.
 */
export function useUrlState() {
  const [params, setParams] = useSearchParams()

  const set = (patch: Patch, options?: { push?: boolean }) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [name, value] of Object.entries(patch)) {
          if (value === null || value === '') next.delete(name)
          else next.set(name, String(value))
        }
        return next
      },
      { replace: !options?.push },
    )
  }

  return {
    get: (name: string) => params.get(name) ?? '',
    /** The value when it is one of `allowed`, otherwise empty, so a hand-edited URL cannot break the request. */
    oneOf: (name: string, allowed: readonly string[]) => {
      const value = params.get(name) ?? ''
      return allowed.includes(value) ? value : ''
    },
    page: Math.max(1, Number.parseInt(params.get('page') ?? '', 10) || 1),
    pageSize: PAGE_SIZES.includes(Number(params.get('pageSize'))) ? Number(params.get('pageSize')) : DEFAULT_PAGE_SIZE,
    setPageSize: (pageSize: number) => set({ pageSize: pageSize === DEFAULT_PAGE_SIZE ? null : pageSize, page: null }),
    setPage: (page: number) => set({ page: page > 1 ? page : null }, { push: true }),
    set,
  }
}

/** A saved page number can fall past the end once rows are gone; go back to the first page. */
export function useLeaveEmptyPage(url: ReturnType<typeof useUrlState>, itemCount?: number) {
  const outOfRange = url.page > 1 && itemCount === 0
  useEffect(() => {
    if (outOfRange) url.set({ page: null })
    // url is a new object each render; only the out-of-range state should trigger this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outOfRange])
}
