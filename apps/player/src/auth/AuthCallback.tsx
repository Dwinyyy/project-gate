import { Link } from 'react-router-dom';
import { Icon } from '@hunter-world/ui';
import { useAccountAuth } from './AuthProvider';
import styles from '../App.module.css';

export function AuthCallback() {
  const { auth } = useAccountAuth();
  const loading = auth.phase === 'initializing';
  const recovering = auth.phase === 'recovery';
  const passwordRequired = auth.phase === 'restricted';
  const confirmed = auth.phase === 'authenticated';
  return (
    <section className={styles.accountPanel} aria-labelledby="callback-title">
      <div className={styles.accountIcon} aria-hidden="true">
        <Icon
          name={
            confirmed || recovering || passwordRequired ? 'shield' : loading ? 'refresh' : 'lock'
          }
          width="30"
          height="30"
        />
      </div>
      <p className={styles.eyebrow}>ACCOUNT VERIFICATION</p>
      <h1 id="callback-title">
        {loading
          ? 'Confirming your account link…'
          : recovering
            ? 'Password recovery link confirmed.'
            : confirmed || passwordRequired
              ? 'Account link confirmed.'
              : 'This account link could not be confirmed.'}
      </h1>
      <p className={styles.accountLead} aria-live="polite">
        {loading
          ? 'The System is checking this time-limited link.'
          : recovering
            ? 'Choose a new password before this account can access the System.'
            : passwordRequired
              ? 'Your email link is confirmed. Sign in with your password to continue.'
              : confirmed
                ? 'Your account session is ready for server validation.'
                : 'The link may have expired or already been used. Request a new link and try again.'}
      </p>
      {!loading ? (
        <Link
          className={styles.primaryLink}
          to={recovering ? '/account/recovery' : confirmed ? '/' : '/account/sign-in'}
        >
          {recovering
            ? 'Choose a new password'
            : confirmed
              ? 'Open the System'
              : 'Return to sign in'}
          <Icon name="arrow" width="17" height="17" />
        </Link>
      ) : null}
    </section>
  );
}
