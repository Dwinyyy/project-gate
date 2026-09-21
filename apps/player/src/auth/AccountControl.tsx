import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@hunter-world/ui';
import { useAccountAuth } from './AuthProvider';
import styles from '../App.module.css';

export function AccountControl() {
  const { controller, auth, validation, session, validationError } = useAccountAuth();
  const [busy, setBusy] = useState(false);

  if (auth.phase === 'initializing') {
    return <span className={styles.accountState}>Account loading…</span>;
  }
  if (auth.phase === 'anonymous' || auth.phase === 'unavailable' || auth.phase === 'restricted') {
    return (
      <Link className={styles.accountLink} to="/account/sign-in">
        <Icon name="lock" width="15" height="15" />
        Sign in
      </Link>
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
          setBusy(true);
          void controller
            .signOut()
            .catch(() => undefined)
            .finally(() => setBusy(false));
        }}
      >
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
}
