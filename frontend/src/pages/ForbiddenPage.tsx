import { ChevronRight } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { NotFoundIllustration } from '../components/NotFoundIllustration'
import { Button, Container } from '../components/ui'
import { t } from '../i18n'
import type { MessageKey } from '../i18n'

function Message({ title, body }: { title: MessageKey; body?: MessageKey }) {
  return (
    <Container className="py-12">
      <h1 className="text-page-title text-ink">{t(title)}</h1>
      {body && <p className="mt-3 max-w-2xl text-body text-ink-body">{t(body)}</p>}
      <Link to="/" className="mt-6 inline-flex items-center gap-1 text-link text-primary hover:underline">
        {t('notFound.back')}
        <ChevronRight aria-hidden size={16} />
      </Link>
    </Container>
  )
}

export const ForbiddenPage = () => <Message title="forbidden.title" body="forbidden.body" />

export function NotFoundPage() {
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <Container className="flex flex-col items-center py-12 text-center">
      <NotFoundIllustration className="w-full max-w-80" />
      <h1 className="mt-6 text-page-title text-ink">{t('notFound.title')}</h1>
      <p className="mt-3 max-w-lg text-link text-ink-body">{t('notFound.body')}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={() => navigate('/')}>{t('notFound.back')}</Button>
        {/* 'default' means this is the first page of the visit, so there is nothing to go back to */}
        {location.key !== 'default' && (
          <Button variant="secondary" onClick={() => navigate(-1)}>
            {t('notFound.previous')}
          </Button>
        )}
      </div>
    </Container>
  )
}
