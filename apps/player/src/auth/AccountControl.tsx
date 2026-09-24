import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@hunter-world/ui';
import { AuthActionError } from '@hunter-world/client';
import { useAccountAuth } from './AuthProvider';
import styles from '../App.module.css';

export function AccountControl() {
  const { controller, auth, validation, session, validationError } = useAccountAuth();
  const [busy, setBusy] = useState(false);
  const [signOutError, setSignOutError] = useState<{
    token: string | null;
    message: string;
  } | null>(null);
  useEffect(() => {
    if (!auth.accessToken) return;
    setSignOutError((current) => (current && current.token !== auth.accessToken ? null : current));
  }, [auth.accessToken]);
  const notice =
    signOutError && (!auth.accessToken || signOutError.token === auth.accessToken) ? (
      <div className={styles.accountNotice} role="alert">
        <p>{signOutError.message}</p>
        <button
          type="button"
          className={styles.textButton}
          aria-label="Dismiss sign-out message"
          onClick={() => setSignOutError(null)}
        >
          Dismiss
        </button>
      </div>
    ) : null;

  if (auth.phase === 'initializing') {
    return <span className={styles.accountState}>Account loading…</span>;
  }
  if (auth.phase === 'anonymous' || auth.phase === 'unavailable' || auth.phase === 'restricted') {
    return (
      <>
        <Link className={styles.accountLink} to="/account/sign-in">
          <Icon name="lock" width="15" height="15" />
          Sign in
        </Link>
        {notice}
      </>
    );
  }
  if (auth.phase === 'recovery') {
    return <span className={styles.accountState}>Recovery in progress</span>;
  }
  if (validation === 'checking') {
    return <span className={styles.accountState}>Checking session…</span>;
  }
  return (
    <div className={styles.accountControl}>
      <span title={validationError ?? undefined}>
        {session?.email ?? auth.user?.email ?? 'Account session unavailable'}
      </span>
      <button
        type="button"
        disabled={busy || !controller}
        onClick={() => {
          if (!controller) return;
          const token = controller.getSnapshot().accessToken;
          setBusy(true);
          setSignOutError(null);
          void controller
            .signOut()
            .catch((cause: unknown) => {
              const currentToken = controller.getSnapshot().accessToken;
              if (currentToken && currentToken !== token) return;
              setSignOutError({
                token,
                message:
                  cause instanceof AuthActionError && cause.code === 'sign_out_incomplete'
                    ? 'You are signed out on this device, but the server could not confirm sign-out. Sign in again and retry.'
                    : 'Sign-out could not be confirmed. Please try again.',
              });
            })
            .finally(() => setBusy(false));
        }}
      >
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
      {notice}
    </div>
  );
}
