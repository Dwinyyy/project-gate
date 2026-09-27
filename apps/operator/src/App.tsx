import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSystemStatus } from '@hunter-world/client';
import { Icon, StatusBadge, SystemMark } from '@hunter-world/ui';
import styles from './App.module.css';
import { OperatorAuth } from './auth/OperatorAuth';
import { useOperatorAuth, type OperatorAuthModel } from './auth/useOperatorAuth';

function mainSiteDestination(path: string): string {
  const isLegacyLocalPreview =
    window.location.port === '5174' &&
    (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost');
  return isLegacyLocalPreview
    ? new URL(path, `${window.location.protocol}//${window.location.hostname}:5173`).href
    : path;
}

function AccessGate({ auth }: { auth: OperatorAuthModel }) {
  const checking =
    auth.view.phase === 'initializing' ||
    auth.view.phase === 'authorization-check' ||
    auth.view.phase === 'redirect';
  const message =
    auth.view.phase === 'denied' || auth.view.phase === 'unavailable'
      ? auth.view.message
      : auth.view.phase === 'redirect'
        ? 'Returning to the main System account screen.'
        : 'Confirming this session before opening the System.';

  return (
    <main className={styles.previewStage}>
      <section
        className={styles.accessGate}
        aria-live="polite"
        aria-busy={checking}
        aria-labelledby="gate-title"
      >
        <div className={styles.gateMark} aria-hidden="true">
          <SystemMark />
        </div>
        <p className={styles.eyebrow}>ACCOUNT SECURITY</p>
        <h1 id="gate-title">
          {checking
            ? 'Checking your account…'
            : auth.view.phase === 'denied'
              ? 'Operator access denied.'
              : 'Operator verification unavailable.'}
        </h1>
        <p className={styles.gateDescription}>{message}</p>
        {!checking ? (
          <div className={styles.gateActions}>
            {auth.view.phase === 'unavailable' && auth.email ? (
              <button
                className={styles.primaryButton}
                type="button"
                onClick={auth.retryVerification}
                disabled={auth.busy}
              >
                Retry verification
                <Icon name="refresh" width="15" height="15" />
              </button>
            ) : null}
            {auth.email ? (
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => void auth.signOut()}
                disabled={auth.busy}
              >
                Sign out
              </button>
            ) : (
              <button
                className={styles.primaryButton}
                type="button"
                onClick={() => window.location.replace(mainSiteDestination('/account/sign-in'))}
              >
                Return to sign in
                <Icon name="arrow" width="15" height="15" />
              </button>
            )}
          </div>
        ) : null}
      </section>
    </main>
  );
}

export function App() {
  const auth = useOperatorAuth();
  const workspaceVisible =
    auth.view.phase === 'mfa-enrollment' ||
    auth.view.phase === 'mfa-challenge' ||
    auth.view.phase === 'authorized';
  const service = useQuery({
    queryKey: ['system', 'status'],
    queryFn: () => getSystemStatus(),
    retry: false,
    enabled: workspaceVisible,
  });
  const connected = service.isSuccess && !service.isFetching && !service.isPaused;
  const unavailable = service.isError || service.isPaused;

  useEffect(() => {
    if (auth.view.phase === 'redirect') {
      window.location.replace(mainSiteDestination(auth.view.to));
    }
  }, [auth.view]);

  if (!workspaceVisible) {
    return <AccessGate auth={auth} />;
  }

  return (
    <div className={styles.previewStage}>
      <p className={styles.previewCaption}>MOBILE OPERATOR PREVIEW · RESTRICTED</p>
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
          <OperatorAuth auth={auth} />
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
    </div>
  );
}
