import { t } from '../i18n'
import { Button, Container } from './ui'

/**
 * Most often a screen's chunk could not be downloaded: the network dropped, or a new version replaced
 * the old files. Reloading fixes both. The error itself means nothing to the user, so it is not shown.
 */
export function RouteError() {
  return (
    <Container className="py-12">
      <h1 className="text-page-title text-ink">{t('routeError.title')}</h1>
      <p className="mt-3 max-w-2xl text-link text-ink-body">{t('routeError.body')}</p>
      <Button className="mt-6" onClick={() => window.location.reload()}>
        {t('routeError.reload')}
      </Button>
    </Container>
  )
}
