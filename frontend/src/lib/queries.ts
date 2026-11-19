import { infiniteQueryOptions, keepPreviousData, queryOptions } from '@tanstack/react-query'
import { api, ApiError } from './api'
import type { LeadColumn } from './leadImport'
import type { AgentDetail, AgentNode, ActivitySummary, AiSettings, AuditItem, CalendarData, ChatConversation, ChatConversationItem, ChatMember, ChatMessagePage, ChatPerson, ChatReviewItem, ChatSearchHit, DepartedWork, CampaignDetail, CampaignRow, ClientCounts, ClientDetail, ClientRow, Dashboard, DeletedLead, DevAccount, GaSettings, Grants, ImportDetail, ImportProblem, ImportSummary, InsuranceProgram, LeadBoard, LeadCounts, LeadDetail, LeadOption, LeadRow, LinkSuggestion, Me, MentionCandidate, NotificationPage, NotificationPref, Page, PlatformSettings, Presence, PublicFormDefinition, ReportData, ReportName, SavedFilter, TaskItem, Tenant, TodayData, User } from './types'
import { pollInterval } from './realtimeStatus'

/** Every query key and request of the app, so invalidating a group cannot miss a screen. */
export const keys = {
  me: ['me'] as const,
  devAccounts: ['devAccounts'] as const,
  users: ['users'] as const,
  permissions: ['permissions'] as const,
  audit: ['audit'] as const,
  tenants: ['tenants'] as const,
  platformSettings: ['platformSettings'] as const,
  agents: ['agents'] as const,
  imports: ['imports'] as const,
  leads: ['leads'] as const,
  leadOptions: ['leadOptions'] as const,
  gaSettings: ['gaSettings'] as const,
  clients: ['clients'] as const,
  programs: ['programs'] as const,
  campaigns: ['campaigns'] as const,
  reports: ['reports'] as const,
  tasks: ['tasks'] as const,
  notifications: ['notifications'] as const,
  presence: ['presence'] as const,
  activeUsers: ['activeUsers'] as const,
  chat: ['chat'] as const,
  ai: ['ai'] as const,
}

export interface PageParams {
  page: number
  pageSize: number
}

// Previous rows stay visible while the next page loads, so the table does not flash empty
const pageQuery = { placeholderData: keepPreviousData }

export const queries = {
  /** Returns null when nobody is signed in. Roles and permissions always come from the server. */
  me: () =>
    queryOptions<Me | null>({
      queryKey: keys.me,
      queryFn: async ({ signal }) => {
        try {
          return await api.get<Me>('/me', undefined, { signal })
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) return null
          throw error
        }
      },
      // Coming back to the tab is when a revoked session or changed role should show up
      refetchOnWindowFocus: true,
    }),

  /**
   * The account switcher for testing (DEV_ACCOUNT_SWITCHER). A 404 means it is off; production builds
   * never ask, because `import.meta.env.DEV` is false there.
   */
  devAccounts: () =>
    queryOptions({
      queryKey: keys.devAccounts,
      queryFn: ({ signal }) => api.get<{ items: DevAccount[] }>('/dev/accounts', undefined, { signal }),
      enabled: import.meta.env.DEV,
      staleTime: 60_000,
      retry: false,
    }),

  users: (params: PageParams & { q?: string; status?: string; role?: string; order?: string }) =>
    queryOptions({
      ...pageQuery,
      queryKey: [...keys.users, 'list', params],
      queryFn: ({ signal }) => api.get<Page<User>>('/users', params, { signal }),
    }),

  user: (id: string) =>
    queryOptions({
      queryKey: [...keys.users, 'detail', id],
      queryFn: ({ signal }) => api.get<User>(`/users/${id}`, undefined, { signal }),
      retry: false,
    }),

  permissions: () =>
    queryOptions({
      queryKey: keys.permissions,
      queryFn: ({ signal }) => api.get<{ grants: Grants; catalog: string[] }>('/permissions', undefined, { signal }),
    }),

  audit: (params: PageParams & { action?: string; role?: string; email?: string; ip?: string; order?: string }) =>
    queryOptions({
      ...pageQuery,
      queryKey: [...keys.audit, params],
      queryFn: ({ signal }) => api.get<Page<AuditItem>>('/audit', params, { signal }),
      // Other people's actions keep arriving, so this list is never considered fresh
      staleTime: 0,
    }),

  tenants: (params: PageParams & { q?: string; status?: string }) =>
    queryOptions({
      ...pageQuery,
      queryKey: [...keys.tenants, 'list', params],
      queryFn: ({ signal }) => api.get<Page<Tenant>>('/platform/tenants', params, { signal }),
    }),

  agentTree: () =>
    queryOptions({
      queryKey: [...keys.agents, 'tree'],
      queryFn: ({ signal }) => api.get<{ items: AgentNode[] }>('/agents/tree', undefined, { signal }),
    }),

  agent: (code: string) =>
    queryOptions({
      queryKey: [...keys.agents, 'detail', code],
      queryFn: ({ signal }) => api.get<AgentDetail>(`/agents/${encodeURIComponent(code)}`, undefined, { signal }),
      retry: false,
    }),

  imports: (params: PageParams) =>
    queryOptions({
      ...pageQuery,
      queryKey: [...keys.imports, 'list', params],
      queryFn: ({ signal }) => api.get<Page<ImportSummary>>('/imports', params, { signal }),
      staleTime: 0,
    }),

  importDetail: (id: string) =>
    queryOptions({
      queryKey: [...keys.imports, 'detail', id],
      queryFn: ({ signal }) => api.get<ImportDetail>(`/imports/${id}`, undefined, { signal }),
      retry: false,
      staleTime: 0,
    }),

  importErrors: (id: string, params: PageParams & { severity?: string }) =>
    queryOptions({
      ...pageQuery,
      queryKey: [...keys.imports, 'errors', id, params],
      queryFn: ({ signal }) => api.get<Page<ImportProblem>>(`/imports/${id}/errors`, params, { signal }),
      staleTime: 0,
    }),

  leads: (params: PageParams & Record<string, string | number | undefined>) =>
    queryOptions({
      ...pageQuery,
      queryKey: [...keys.leads, 'list', params],
      queryFn: ({ signal }) => api.get<Page<LeadRow>>('/leads', params, { signal }),
      // Someone else can assign or comment at any moment
      staleTime: 0,
    }),

  /** LEAD-24: ids the current filter shows, in list order, at most one assignment (200). */
  leadIds: (params: Record<string, string | number | undefined>) =>
    queryOptions({
      queryKey: [...keys.leads, 'ids', params],
      queryFn: ({ signal }) => api.get<{ ids: string[]; total: number }>('/leads/ids', params, { signal }),
      staleTime: 0,
    }),

  leadCounts: () =>
    queryOptions({
      queryKey: [...keys.leads, 'counts'],
      queryFn: ({ signal }) => api.get<LeadCounts>('/leads/counts', undefined, { signal }),
      staleTime: 0,
    }),

  /** Section 17.14: the person's tasks (or their line's). */
  tasks: (params: Record<string, string | undefined>) =>
    queryOptions({
      queryKey: [...keys.tasks, 'list', params],
      queryFn: ({ signal }) => api.get<{ items: TaskItem[] }>('/tasks', params, { signal }),
      placeholderData: keepPreviousData,
      staleTime: 0,
    }),

  /** Section 17.12: one's notifications, newest first. */
  notifications: (params: Record<string, string | number | undefined>) =>
    queryOptions({
      queryKey: [...keys.notifications, 'list', params],
      queryFn: ({ signal }) => api.get<NotificationPage>('/notifications', params, { signal }),
      placeholderData: keepPreviousData,
      staleTime: 0,
    }),

  /** NTF-1: the number on the bell. Pushed over the WebSocket; polled every minute only without one. */
  notificationsUnread: () =>
    queryOptions({
      queryKey: [...keys.notifications, 'unread'],
      queryFn: ({ signal }) => api.get<{ unread: number }>('/notifications/unread', undefined, { signal }),
      refetchInterval: pollInterval,
      refetchOnWindowFocus: true,
      staleTime: 30_000,
    }),

  /** C1: who in the GA is online. Kept current by `presence.changed`; re-read every 5 minutes, or each minute without a socket. */
  presence: () =>
    queryOptions({
      queryKey: keys.presence,
      queryFn: ({ signal }) => api.get<Presence>('/presence', undefined, { signal }),
      refetchInterval: () => pollInterval() || 5 * 60_000,
      staleTime: 60_000,
    }),

  /** K5: when these colleagues were last active (epoch ms); ids sorted so one set is one query. */
  lastSeen: (ids: string[]) =>
    queryOptions({
      queryKey: [...keys.presence, 'lastSeen', ids],
      queryFn: ({ signal }) =>
        api.get<{ items: { id: string; lastSeenAt: number | null }[] }>('/presence/last-seen', { ids: ids.join(',') }, { signal }),
      staleTime: 60_000,
      placeholderData: keepPreviousData,
    }),

  /** Home charts. Kept current by `dashboard.changed`; polled only without a socket. */
  dashboard: (days: number) =>
    queryOptions({
      queryKey: [...keys.reports, 'dashboard', days],
      queryFn: ({ signal }) => api.get<Dashboard>('/reports/dashboard', { days }, { signal }),
      refetchInterval: pollInterval,
      staleTime: 30_000,
      placeholderData: keepPreviousData,
    }),

  /** C1: daily, weekly and monthly active users (users.manage). */
  activeUsers: () =>
    queryOptions({
      queryKey: keys.activeUsers,
      queryFn: ({ signal }) => api.get<ActivitySummary>('/presence/activity', undefined, { signal }),
      staleTime: 60_000,
    }),

  /** C2: the signed-in user's conversations. Kept current by chat.* events. */
  chatConversations: () =>
    queryOptions({
      queryKey: [...keys.chat, 'list'],
      queryFn: ({ signal }) => api.get<{ items: ChatConversationItem[] }>('/chat/conversations', undefined, { signal }),
      staleTime: 60_000,
      refetchInterval: () => pollInterval(),
    }),

  /** The number on the chat icon (muted conversations left out). */
  chatUnread: () =>
    queryOptions({
      queryKey: [...keys.chat, 'unread'],
      queryFn: ({ signal }) => api.get<{ unread: number }>('/chat/unread', undefined, { signal }),
      staleTime: 60_000,
      refetchInterval: () => pollInterval(),
    }),

  chatConversation: (id: string) =>
    queryOptions({
      queryKey: [...keys.chat, 'detail', id],
      queryFn: ({ signal }) => api.get<ChatConversation>(`/chat/conversations/${id}`, undefined, { signal }),
      staleTime: 60_000,
    }),

  /** Newest page first; `fetchNextPage` loads older messages. Pushed messages are added by realtime.ts. */
  chatMessages: (id: string) =>
    infiniteQueryOptions({
      queryKey: [...keys.chat, 'messages', id],
      queryFn: ({ pageParam, signal }) =>
        api.get<ChatMessagePage>(`/chat/conversations/${id}/messages`, pageParam ? { before: pageParam } : undefined, { signal }),
      initialPageParam: undefined as number | undefined,
      getNextPageParam: (last) => (last.hasMore ? last.items[0]?.seq : undefined),
      staleTime: 5 * 60_000,
    }),

  /** C4: one's messages containing `q`, without diacritics, newest first. */
  chatSearch: (q: string) =>
    queryOptions({
      queryKey: [...keys.chat, 'search', q],
      queryFn: ({ signal }) => api.get<{ items: ChatSearchHit[] }>('/chat/search', { q }, { signal }),
      placeholderData: keepPreviousData,
      staleTime: 30_000,
    }),

  /** Open question 12e: leads and clients left by people who have gone (lead managers). */
  departedWork: () =>
    queryOptions({
      queryKey: [...keys.leads, 'departed'],
      queryFn: ({ signal }) => api.get<DepartedWork>('/leads/departed', undefined, { signal }),
      staleTime: 60_000,
    }),

  /** C2, K1: people of the GA to start a conversation with. */
  chatPeople: (q: string) =>
    queryOptions({
      queryKey: [...keys.chat, 'people', q],
      queryFn: ({ signal }) => api.get<{ items: ChatPerson[] }>('/chat/people', q ? { q } : undefined, { signal }),
      placeholderData: keepPreviousData,
      staleTime: 30_000,
    }),

  /** K3: the GA's conversations, for the GA head. */
  chatReview: (params: { page: number; pageSize: number; q: string }) =>
    queryOptions({
      queryKey: [...keys.chat, 'review', params],
      queryFn: ({ signal }) => api.get<Page<ChatReviewItem>>('/chat/review', params, { signal }),
      placeholderData: keepPreviousData,
    }),

  /** K3: every read is audited on the server, so it is never served from the cache. */
  chatReviewMessages: (id: string) =>
    queryOptions({
      queryKey: [...keys.chat, 'reviewMessages', id],
      queryFn: ({ signal }) =>
        api.get<ChatMessagePage & { conversation: { id: string; kind: string; title: string | null; members: ChatMember[] } }>(`/chat/review/${id}/messages`, { limit: 100 }, { signal }),
      staleTime: 0,
      gcTime: 0,
    }),

  /** CMT-5: people who see a lead or client, for the @ picker. `path` is `/leads/{id}` or `/clients/{code}`. */
  mentionable: (path: string, q: string) =>
    queryOptions({
      queryKey: ['mentionable', path, q],
      queryFn: ({ signal }) => api.get<{ items: MentionCandidate[] }>(`${path}/mentionable`, q ? { q } : undefined, { signal }),
      placeholderData: keepPreviousData,
      staleTime: 30_000,
    }),

  /** Section 14.4: the GA's AI settings and provider key status (never a key). */
  aiSettings: () =>
    queryOptions({
      queryKey: [...keys.ai, 'settings'],
      queryFn: ({ signal }) => api.get<AiSettings>('/ai/admin/settings', undefined, { signal }),
      staleTime: 0,
      refetchOnWindowFocus: false,
    }),

  /** AI-17: a provider's chat models, read live with the GA's key. */
  aiModels: (provider: string) =>
    queryOptions({
      queryKey: [...keys.ai, 'models', provider],
      queryFn: ({ signal }) => api.get<{ items: string[] }>(`/ai/admin/keys/${provider}/models`, undefined, { signal }),
      staleTime: 5 * 60_000,
      retry: false,
    }),

  /** NTF-3 */
  notificationPrefs: () =>
    queryOptions({
      queryKey: [...keys.notifications, 'prefs'],
      queryFn: ({ signal }) => api.get<{ items: NotificationPref[] }>('/notifications/prefs', undefined, { signal }),
    }),

  /** TASK-5 */
  today: () =>
    queryOptions({
      queryKey: [...keys.tasks, 'today'],
      queryFn: ({ signal }) => api.get<TodayData>('/today', undefined, { signal }),
      staleTime: 0,
    }),

  /** TASK-6 */
  calendar: (from: string, to: string) =>
    queryOptions({
      queryKey: [...keys.tasks, 'calendar', from, to],
      queryFn: ({ signal }) => api.get<CalendarData>('/calendar', { from, to }, { signal }),
      placeholderData: keepPreviousData,
      staleTime: 0,
    }),

  /** Chapter 13: one report for one period. */
  report: (name: ReportName, params: { from: string; to: string; groupBy?: string }) =>
    queryOptions({
      queryKey: [...keys.reports, name, params],
      queryFn: ({ signal }) => api.get<ReportData>(`/reports/${name}`, params, { signal }),
      placeholderData: keepPreviousData,
      staleTime: 60_000,
    }),

  /** Section 16.9 */
  campaigns: (params: PageParams & Record<string, string | number | undefined>) =>
    queryOptions({
      ...pageQuery,
      queryKey: [...keys.campaigns, 'list', params],
      queryFn: ({ signal }) => api.get<Page<CampaignRow> & { canManage: boolean }>('/campaigns', params, { signal }),
    }),

  /** CMP-3 */
  campaign: (id: string) =>
    queryOptions({
      queryKey: [...keys.campaigns, 'detail', id],
      queryFn: ({ signal }) => api.get<CampaignDetail>(`/campaigns/${id}`, undefined, { signal }),
      staleTime: 0,
      retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
    }),

  /** CMP-1: who a campaign may be given to. */
  campaignOwners: () =>
    queryOptions({
      queryKey: [...keys.campaigns, 'owners'],
      queryFn: ({ signal }) => api.get<{ items: { id: string; name: string; email: string }[] }>('/campaigns/owners', undefined, { signal }),
      staleTime: 5 * 60_000,
    }),

  /** PRG-3: everyone in the GA reads the programme catalogue, hidden ones included. */
  programs: () =>
    queryOptions({
      queryKey: keys.programs,
      queryFn: ({ signal }) => api.get<{ items: InsuranceProgram[] }>('/programs', undefined, { signal }),
      staleTime: 5 * 60_000,
    }),

  /** CUS-14 */
  clients: (params: PageParams & Record<string, string | number | undefined>) =>
    queryOptions({
      ...pageQuery,
      queryKey: [...keys.clients, 'list', params],
      queryFn: ({ signal }) => api.get<Page<ClientRow>>('/clients', params, { signal }),
    }),

  /** SIG-1: the counts of the signal tabs, for the same "Khách hàng của" as the list. */
  clientCounts: (agents?: string) =>
    queryOptions({
      queryKey: [...keys.clients, 'counts', agents ?? ''],
      queryFn: ({ signal }) => api.get<ClientCounts>('/clients/counts', { agents }, { signal }),
      staleTime: 0,
    }),

  /** FAM-7: up to 10 clients in scope, for linking a relative who is already a client. */
  clientSearch: (q: string) =>
    queryOptions({
      queryKey: [...keys.clients, 'search', q],
      queryFn: ({ signal }) => api.get<Page<ClientRow>>('/clients', { q, agents: 'ALL', pageSize: 10 }, { signal }),
      enabled: q.trim().length >= 2,
      placeholderData: keepPreviousData,
    }),

  /** CUS-15. Each visit is audited (CUS-9), so it is not served from a long cache. */
  client: (code: string) =>
    queryOptions({
      queryKey: [...keys.clients, 'detail', code],
      queryFn: ({ signal }) => api.get<ClientDetail>(`/clients/${code}`, undefined, { signal }),
      staleTime: 0,
      retry: (count, error) => !(error instanceof ApiError && (error.status === 404 || error.status === 403)) && count < 2,
    }),

  /** USER-16: PLATFORM_ADMIN only; the switches above every GA's own settings. */
  platformSettings: () =>
    queryOptions({
      queryKey: keys.platformSettings,
      queryFn: ({ signal }) => api.get<PlatformSettings>('/platform/settings', undefined, { signal }),
    }),

  /** Section 5.2: GA_HEAD only. `version` goes back with the save. */
  gaSettings: () =>
    queryOptions({
      queryKey: keys.gaSettings,
      queryFn: ({ signal }) => api.get<GaSettings>('/settings', undefined, { signal }),
      // A form must open on the latest version, or saving it is refused as stale
      staleTime: 0,
      // Refetching while someone types would only fight their edits
      refetchOnWindowFocus: false,
    }),

  /** OPT-9: the GA's lead catalogue, hidden values included, so old leads keep their labels. */
  leadOptions: () =>
    queryOptions({
      queryKey: keys.leadOptions,
      queryFn: ({ signal }) => api.get<{ items: LeadOption[] }>('/lead-options', undefined, { signal }),
      staleTime: 5 * 60_000,
    }),

  leadFacets: () =>
    queryOptions({
      queryKey: [...keys.leads, 'facets'],
      queryFn: ({ signal }) =>
        api.get<{ sources: string[]; campaigns: { id: string; name: string }[]; agents: { code: string; name: string }[] }>('/leads/facets', undefined, { signal }),
    }),

  leadAssignees: () =>
    queryOptions({
      queryKey: [...keys.leads, 'assignees'],
      queryFn: ({ signal }) => api.get<{ items: { agentCode: string; name: string; openLeads: number }[] }>('/leads/assignees', undefined, { signal }),
    }),

  /** Opening a lead marks it seen on the server (LEAD-25), so each visit must reach it. */
  /** LEAD-19: the current filter by stage. */
  leadBoard: (params: Record<string, string | number | undefined>) =>
    queryOptions({
      queryKey: [...keys.leads, 'board', params],
      queryFn: ({ signal }) => api.get<LeadBoard>('/leads/board', params, { signal }),
      placeholderData: keepPreviousData,
      staleTime: 0,
    }),

  /** LEAD-38 */
  savedFilters: () =>
    queryOptions({
      queryKey: [...keys.leads, 'filters'],
      queryFn: ({ signal }) => api.get<{ items: SavedFilter[] }>('/leads/filters', undefined, { signal }),
    }),

  /** LEAD-40: the bin, last 30 days. */
  deletedLeads: (params: PageParams) =>
    queryOptions({
      ...pageQuery,
      queryKey: [...keys.leads, 'deleted', params],
      queryFn: ({ signal }) => api.get<Page<DeletedLead>>('/leads/deleted', params, { signal }),
      staleTime: 0,
    }),

  lead: (id: string) =>
    queryOptions({
      queryKey: [...keys.leads, 'detail', id],
      queryFn: ({ signal }) => api.get<LeadDetail>(`/leads/${id}`, undefined, { signal }),
      retry: false,
      staleTime: 0,
    }),

  /** LEAD-32: up to 5 suggestions, or 10 matches for a search. */
  linkSuggestions: (id: string, q: string) =>
    queryOptions({
      queryKey: [...keys.leads, 'link-suggestions', id, q],
      queryFn: ({ signal }) => api.get<{ items: LinkSuggestion[] }>(`/leads/${id}/link-suggestions`, { q: q || undefined }, { signal }),
      placeholderData: keepPreviousData,
    }),

  leadImportSetup: () =>
    queryOptions({
      queryKey: [...keys.imports, 'lead-setup'],
      queryFn: ({ signal }) => api.get<{ columns: LeadColumn[]; agents: { agentCode: string; name: string }[] }>('/imports/lead-setup', undefined, { signal }),
    }),

  /** TENANT-4: each opening must reach the server, because the server writes CROSS_TENANT_READ. */
  tenantUsers: (tenantId: string) =>
    queryOptions({
      queryKey: [...keys.tenants, tenantId, 'users'],
      queryFn: ({ signal }) => api.get<Page<User>>(`/platform/tenants/${tenantId}/users`, { pageSize: 50 }, { signal }),
      staleTime: 0,
      gcTime: 0,
    }),

  /** USER-16 */
  mfaStatus: () =>
    queryOptions({
      queryKey: ['mfa', 'status'],
      queryFn: ({ signal }) => api.get<{ enabled: boolean; required: boolean; recoveryCodesLeft: number }>('/auth/mfa', undefined, { signal }),
      staleTime: 0,
    }),

  /** CMP-4: no session, so nothing else may share its cache */
  publicForm: (slug: string) =>
    queryOptions({
      queryKey: ['publicForm', slug],
      queryFn: ({ signal }) => api.get<PublicFormDefinition>(`/public/forms/${encodeURIComponent(slug)}`, undefined, { signal }),
      retry: false,
      staleTime: Infinity,
    }),

  invite: (token: string) =>
    queryOptions({
      queryKey: ['invite', token],
      queryFn: ({ signal }) =>
        api.get<{ email: string; name: string; tenantName: string | null }>(`/invites/${encodeURIComponent(token)}`, undefined, { signal }),
      retry: false,
      gcTime: 0,
    }),

  passwordReset: (token: string) =>
    queryOptions({
      queryKey: ['password-reset', token],
      queryFn: ({ signal }) => api.get<{ email: string }>(`/auth/password/reset/${encodeURIComponent(token)}`, undefined, { signal }),
      retry: false,
      gcTime: 0,
    }),
}
