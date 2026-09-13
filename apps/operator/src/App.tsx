import { useQuery } from '@tanstack/react-query';
import { getSystemStatus } from '@hunter-world/client';
import { Icon, StatusBadge, SystemMark } from '@hunter-world/ui';
import styles from './App.module.css';
import { OperatorAuth } from './auth/OperatorAuth';

export function App() {
  const service = useQuery({
    queryKey: ['system', 'status'],
    queryFn: () => getSystemStatus(),
    retry: false,
  });
  const connected = service.isSuccess && !service.isFetching && !service.isPaused;
  const unavailable = service.isError || service.isPaused;

  return (
    <div className={styles.app}>
      <a className="hw-skip-link" href="#main-content">
        Skip to content
      </a>
      <header className={styles.header}>
        <div className={styles.brand}>
          <SystemMark />
          <span>
            HUNTER WORLD<span>OPERATOR WORKSPACE</span>
          </span>
        </div>
        <span className={styles.headerBadge}>
          <Icon name="lock" width="13" height="13" />
          RESTRICTED ACCESS
        </span>
      </header>
      <main id="main-content" className={styles.main} tabIndex={-1}>
        <p className={styles.eyebrow}>SYSTEM ADMINISTRATION</p>
        <OperatorAuth />
        <section className={styles.servicePanel} aria-labelledby="service-title">
          <div className={styles.serviceHeading}>
            <h2 id="service-title">Public service connection</h2>
            <div aria-live="polite" aria-atomic="true">
              <StatusBadge tone={unavailable ? 'warning' : connected ? 'positive' : 'muted'}>
                {service.isFetching
                  ? 'Connecting'
                  : unavailable
                    ? 'Unavailable'
                    : connected
                      ? 'Connected'
                      : 'Waiting'}
              </StatusBadge>
            </div>
          </div>
          <p>
            {service.isPaused
              ? 'You appear to be offline. Reconnect to check the public System service.'
              : service.isError
                ? 'The public System service could not be reached. You can retry the connection.'
                : service.isFetching
                  ? 'Contacting the public System service…'
                  : 'Service availability does not grant operator access.'}
          </p>
          <button
            type="button"
            className={styles.retryButton}
            onClick={() => {
              void service.refetch();
            }}
            disabled={service.isFetching}
          >
            <Icon name="refresh" width="14" height="14" />
            {unavailable
              ? 'Retry connection'
              : service.isFetching
                ? 'Connecting…'
                : 'Check connection'}
          </button>
        </section>
      </main>
      <footer className={styles.footer}>
        <span>HUNTER WORLD</span>
        <span>Operator access · Password + authenticator + active record</span>
      </footer>
    </div>
  );
}
