import { tDynamic } from '../i18n'

const BASE_URL = '/api/v1'

export interface Issue {
  path: string
  message: string
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly issues?: Issue[]
  /** Anything else the API sent with the code, such as the client a `client_exists` points to. */
  readonly details: Record<string, unknown>

  constructor(status: number, code: string, issues?: Issue[], details: Record<string, unknown> = {}) {
    super(code)
    this.status = status
    this.code = code
    this.issues = issues
    this.details = details
  }
}

/** UI-2: the API returns codes; the catalogue holds the Vietnamese message. */
export function errorMessage(error: unknown): string {
  const code = error instanceof ApiError ? error.code : 'network'
  return tDynamic(`errors.${code}`, tDynamic('errors.internal', code))
}

let onUnauthenticated: () => void = () => {}
export const setUnauthenticatedHandler = (handler: () => void) => {
  onUnauthenticated = handler
}

type Query = Record<string, string | number | undefined>

async function request<T>(method: string, path: string, options: { body?: unknown; query?: Query; signal?: AbortSignal } = {}): Promise<T> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  const url = `${BASE_URL}${path}${params.size ? `?${params}` : ''}`

  let response: Response
  try {
    response = await fetch(url, {
      method,
      credentials: 'same-origin',
      signal: options.signal,
      // A FormData body sets its own multipart Content-Type, boundary included
      headers: options.body === undefined || options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : options.body instanceof FormData ? options.body : JSON.stringify(options.body),
    })
  } catch (error) {
    // A cancelled request is not a failure; TanStack Query recognises the original error
    if (options.signal?.aborted) throw error
    throw new ApiError(0, 'network')
  }

  if (response.status === 204) return undefined as T
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const code: string = payload.error ?? 'internal'
    if (code === 'unauthenticated') onUnauthenticated()
    throw new ApiError(response.status, code, payload.issues, payload)
  }
  return payload as T
}

export const api = {
  get: <T>(path: string, query?: object, options?: { signal?: AbortSignal }) =>
    request<T>('GET', path, { query: query as Query, signal: options?.signal }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  /** A body only where the API asks for one, such as the reason for undoing a link (LEAD-32). */
  delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body === undefined ? {} : { body }),
  /** Multipart upload: each file under `field`. */
  upload: <T>(path: string, files: File[], field = 'files') => {
    const form = new FormData()
    for (const file of files) form.append(field, file)
    return request<T>('POST', path, { body: form })
  },
}

/** Where the API streams a chat file; the session cookie goes with it, so <img> works directly. */
export const chatFileUrl = (id: string, download = false) => `${BASE_URL}/chat/files/${id}${download ? '?download=1' : ''}`

/** Which form field an API error belongs to, so it can show on that field instead of on the form. */
export function errorField<F extends string>(error: unknown, fields: Record<string, F>): F | undefined {
  return error instanceof ApiError ? fields[error.code] : undefined
}
