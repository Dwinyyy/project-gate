import { Link } from 'react-router-dom';
import { Icon } from '@hunter-world/ui';
import { useAccountAuth } from './AuthProvider';
import styles from '../App.module.css';

export function AuthCallback() {
  const { auth } = useAccountAuth();
  const loading = auth.phase === 'initializing';
  const confirmed = auth.phase === 'authenticated' || auth.phase === 'recovery';
  return (
    <section className={styles.accountPanel} aria-labelledby="callback-title">
      <div className={styles.accountIcon} aria-hidden="true">
        <Icon name={confirmed ? 'shield' : loading ? 'refresh' : 'lock'} width="30" height="30" />
      </div>
      <p className={styles.eyebrow}>ACCOUNT VERIFICATION</p>
      <h1 id="callback-title">
        {loading
          ? 'Confirming your account link…'
          : confirmed
            ? 'Account link confirmed.'
            : 'This account link could not be confirmed.'}
      </h1>
      <p className={styles.accountLead} aria-live="polite">
        {loading
          ? 'The System is checking this time-limited link.'
          : confirmed
            ? 'Your account session is ready for server validation.'
            : 'The link may have expired or already been used. Request a new link and try again.'}
      </p>
      {!loading ? (
        <Link className={styles.primaryLink} to={confirmed ? '/' : '/account/sign-in'}>
          {confirmed ? 'Open the System' : 'Return to sign in'}
          <Icon name="arrow" width="17" height="17" />
        </Link>
      ) : null}
    </section>
  );
}
