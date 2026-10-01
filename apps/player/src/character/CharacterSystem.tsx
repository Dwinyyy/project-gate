import { Link } from 'react-router-dom';
import { CharacterActionError } from '@hunter-world/client';
import { CharacterOnboarding } from './CharacterOnboarding';
import { CharacterPortrait } from './CharacterPortrait';
import { useCharacterSession } from './useCharacterSession';
import styles from './Character.module.css';

type CharacterSession = ReturnType<typeof useCharacterSession>;

function stateLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function CharacterSystem({ state }: { state: CharacterSession }) {
  const { owner, query, data } = state;
  if (!owner) return null;
  if (query.isPaused) {
    return (
      <section className={styles.panel} role="status">
        <p className={styles.eyebrow}>PRIVATE SYSTEM</p>
        <h1>Connection unavailable</h1>
        <p className={styles.lead}>
          Reconnect to retrieve confirmed character state. No creation will be sent automatically.
        </p>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() => void query.refetch()}
        >
          Check current state
        </button>
      </section>
    );
  }
  if (query.isPending || (query.isFetching && !data)) {
    return (
      <section className={styles.panel} role="status">
        <p className={styles.eyebrow}>PRIVATE SYSTEM</p>
        <h1>Checking character state…</h1>
        <p className={styles.lead}>Retrieving your confirmed identity.</p>
      </section>
    );
  }
  if (query.isError || !data) {
    const expired = query.error instanceof CharacterActionError && query.error.status === 401;
    return (
      <section className={styles.panel} role="alert">
        <p className={styles.eyebrow}>PRIVATE SYSTEM</p>
        <h1>{expired ? 'Session expired' : 'Character service unavailable'}</h1>
        <p className={styles.lead}>
          {expired
            ? 'Sign out and sign in again to check your character.'
            : 'Your character information could not be confirmed. Check your connection and try again.'}
        </p>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() => void query.refetch()}
        >
          Retry character check
        </button>
      </section>
    );
  }
  if (data.mode === 'onboarding') {
    return (
      <CharacterOnboarding
        key={owner}
        owner={owner}
        token={state.token!}
        creation={data.creation}
        checking={query.isFetching}
        confirmation={state.confirmation}
        refresh={state.refresh}
      />
    );
  }
  const character = data.character;
  if (!character) {
    return (
      <section className={styles.panel} role="status">
        <p className={styles.eyebrow}>PRIVATE SYSTEM</p>
        <h1>
          {data.mode === 'observer'
            ? 'Observer access'
            : data.mode === 'restricted'
              ? 'Account restricted'
              : 'Character unavailable'}
        </h1>
        <p className={styles.lead}>
          {data.mode === 'observer'
            ? 'This account is in a read-only state. Character history and next-life features are not available yet.'
            : data.mode === 'restricted'
              ? 'This account cannot create or act. Your private information remains protected.'
              : 'The current character state could not be displayed.'}
        </p>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() => void query.refetch()}
        >
          Check current state
        </button>
      </section>
    );
  }
  return (
    <>
      <div className={styles.intro}>
        <p className={styles.eyebrow}>PERSONAL SYSTEM · PRIVATE</p>
        <h1>{character.displayAlias}</h1>
        <p className={styles.lead}>Your confirmed identity in Hunter World.</p>
      </div>
      <section className={styles.identityCard} aria-label="Character overview">
        <CharacterPortrait appearance={character.appearance} compact />
        <div className={styles.identityDetails}>
          <p className={styles.eyebrow}>CHARACTER RECORD</p>
          <h2>{character.displayAlias}</h2>
          <dl>
            <div>
              <dt>Life</dt>
              <dd>{stateLabel(character.lifeState)}</dd>
            </div>
            <div>
              <dt>Awakening</dt>
              <dd>{stateLabel(character.awakeningState)}</dd>
            </div>
            <div>
              <dt>Presence</dt>
              <dd>{stateLabel(character.presenceState)}</dd>
            </div>
            <div>
              <dt>Registered</dt>
              <dd>
                <time dateTime={character.createdAt}>
                  {new Date(character.createdAt).toLocaleDateString()}
                </time>
              </dd>
            </div>
          </dl>
        </div>
      </section>
      {data.mode === 'incapacitated' || character.lifeState === 'incapacitated' ? (
        <p className={styles.notice} role="status">
          Incapacitated. Your current condition is read-only; ordinary actions are unavailable.
        </p>
      ) : null}
      {data.mode === 'restricted' ? (
        <p className={styles.notice} role="status">
          Account restricted. You can view this private character, but creation and actions are
          unavailable.
        </p>
      ) : null}
      {data.mode === 'observer' ? (
        <p className={styles.notice} role="status">
          Observer access is read-only. Character history is not available yet.
        </p>
      ) : null}
      <section className={styles.modulePanel} aria-labelledby="future-modules">
        <h2 id="future-modules">System modules</h2>
        <p>
          World activity, inventory and profile controls will appear here when their authoritative
          services are ready.
        </p>
        <Link to="/map">Explore available screens</Link>
      </section>
    </>
  );
}
