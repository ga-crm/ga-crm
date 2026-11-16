import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useMe } from '../auth/useMe'
import { Container, PageHeader } from '../components/ui'
import { t } from '../i18n'
import { SETTINGS_ITEMS } from '../lib/nav'

/** The person's own settings, one card per screen; the sidebar has a single "Cài đặt" entry for it. */
export function SettingsPage() {
  const { data: me } = useMe()
  if (!me) return null
  const items = SETTINGS_ITEMS.filter((item) => item.visible(me))

  return (
    <>
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <Container className="flex-none pb-6">
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map(({ to, label, description, icon: Icon, chunk }) => (
            <li key={to}>
              <Link
                to={to}
                onPointerEnter={() => void chunk()}
                className="group flex h-full min-h-24 items-start gap-4 rounded-lg border border-band p-5 transition-colors duration-200 ease-out hover:bg-chrome focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
              >
                <span className="flex size-10 flex-none items-center justify-center rounded-md bg-chrome text-ink-body group-hover:bg-band">
                  <Icon aria-hidden size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-subhead text-ink">{t(label)}</span>
                  <span className="mt-1 block text-caption text-ink-meta">{t(description)}</span>
                </span>
                <ChevronRight aria-hidden size={18} className="mt-1 flex-none text-ink-meta group-hover:text-primary" />
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </>
  )
}
