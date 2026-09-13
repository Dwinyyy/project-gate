import { useEffect, useRef } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getSystemStatus } from '@hunter-world/client';
import { Icon, StatusBadge, SystemMark, type IconName } from '@hunter-world/ui';
import styles from './App.module.css';
import { AccountAccess } from './auth/AccountAccess';
import { AccountControl } from './auth/AccountControl';
import { AuthCallback } from './auth/AuthCallback';
import { Recovery } from './auth/Recovery';

const navigation: { path: string; label: string; icon: IconName }[] = [
  { path: '/', label: 'System', icon: 'system' },
  { path: '/map', label: 'Map', icon: 'map' },
  { path: '/activity', label: 'Activity', icon: 'activity' },
  { path: '/community', label: 'Community', icon: 'community' },
  { path: '/inventory', label: 'Inventory', icon: 'inventory' },
];

const accountTitles: Record<string, string> = {
  '/account/sign-in': 'Sign in',
  '/account/register': 'Registration',
  '/account/recovery': 'Recovery',
  '/auth/callback': 'Verification',
};

const plannedScreens = {
  map: {
    title: 'Map',
    icon: 'map',
    eyebrow: 'EXPLORE YOUR WORLD',
    heading: 'A world waiting to be discovered.',
    description:
      'Hubs, encounters, and local opportunities will appear here when world exploration becomes available.',
    note: 'The map is not available in this release. Your location is not being requested or tracked.',
  },
  activity: {
    title: 'Activity',
    icon: 'activity',
    eyebrow: 'YOUR STORY, RECORDED',
    heading: 'Every journey leaves a trace.',
    description: 'Your quests, confirmed outcomes, and System messages will have a place here.',
    note: 'Activity becomes available with persistent characters and gameplay. There are no recorded actions in this release.',
  },
  community: {
    title: 'Community',
    icon: 'community',
    eyebrow: 'A SOCIETY BEYOND THE GATES',
    heading: 'Find your place among others.',
    description:
      'The Association Board will connect observations, conversations, and the people shaping this world.',
    note: 'Community features are not available yet. Posts, guilds, and player profiles cannot be created in this release.',
  },
  inventory: {
    title: 'Inventory',
    icon: 'inventory',
    eyebrow: 'WHAT YOU CARRY MATTERS',
    heading: 'Make room for what comes next.',
    description: 'Equipment, materials, and the items you earn will be managed here.',
    note: 'Inventory and commerce are not available yet. No items, equipment, or currency have been assigned.',
  },
  body: {
    title: 'Body status',
    icon: 'body',
    eyebrow: 'YOUR CHARACTER, IN FOCUS',
    heading: 'A clearer view of your condition.',
    description:
      'Your character’s condition and recovery will be available in the body-status panel.',
    note: 'Body status requires a persistent character. Character creation is not available in this release.',
  },
  identity: {
    title: 'System ID',
    icon: 'identity',
    eyebrow: 'AN IDENTITY OF YOUR OWN',
    heading: 'Your story starts with an identity.',
    description: 'Your System ID will present the identity and details you choose to share.',
    note: 'Identity cards require a persistent character. No ID, rank, class, or invitation code has been generated.',
  },
} satisfies Record<
  string,
  {
    title: string;
    icon: IconName;
    eyebrow: string;
    heading: string;
    description: string;
    note: string;
  }
>;

function ConnectionPanel() {
  const status = useQuery({
    queryKey: ['system', 'status'],
    queryFn: () => getSystemStatus(),
    retry: false,
  });
  const connected = status.isSuccess && !status.isFetching && !status.isPaused;
  const unavailable = status.isError || status.isPaused;
  const label = status.isFetching
    ? 'Connecting'
    : unavailable
      ? 'Connection unavailable'
      : connected
        ? 'Connected'
        : 'Waiting for connection';

  return (
    <section className={styles.connectionPanel} aria-labelledby="connection-title">
      <div className={styles.panelHeading}>
        <h2 id="connection-title">System connection</h2>
        <Icon name="system" />
      </div>
      <div aria-live="polite" aria-atomic="true">
        <StatusBadge tone={unavailable ? 'warning' : connected ? 'positive' : 'muted'}>
          {label}
        </StatusBadge>
        <p className={styles.connectionDescription}>
          {status.isPaused
            ? 'You appear to be offline. Reconnect to check the System service.'
            : status.isError
              ? 'We couldn’t reach the System. Check your connection and try again.'
              : status.isFetching
                ? 'Contacting the System service…'
                : connected
                  ? 'The System service is available. Account access can be verified; gameplay is not enabled yet.'
                  : 'Waiting to contact the System service.'}
        </p>
      </div>
      {connected && status.data ? (
        <dl className={styles.connectionDetails}>
          <div>
            <dt>Release</dt>
            <dd>Foundation</dd>
          </div>
          <div>
            <dt>Last response</dt>
            <dd>
              <time dateTime={status.data.serverTime}>
                {new Date(status.data.serverTime).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })}
              </time>
            </dd>
          </div>
        </dl>
      ) : null}
      <button
        className={styles.textButton}
        type="button"
        onClick={() => {
          void status.refetch();
        }}
        disabled={status.isFetching}
      >
        <Icon name="refresh" width="14" height="14" />
        {unavailable ? 'Retry connection' : status.isFetching ? 'Connecting…' : 'Check connection'}
      </button>
    </section>
  );
}

function SystemScreen() {
  return (
    <>
      <div className={styles.pageIntro}>
        <div>
          <p className={styles.eyebrow}>YOUR SYSTEM</p>
          <h1>
            Welcome to Hunter World<span>.</span>
          </h1>
        </div>
        <span className={styles.releaseTag}>FOUNDATION RELEASE</span>
      </div>
      <div className={styles.dashboardGrid}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroArtwork} aria-hidden="true">
            <div className={styles.orbitOuter} />
            <div className={styles.orbitInner} />
            <div className={styles.orbitCore}>
              <SystemMark />
            </div>
            <div className={styles.orbitLine} />
          </div>
          <div className={styles.heroContent}>
            <span className={styles.heroLabel}>
              <span /> A NEW WORLD IS TAKING SHAPE
            </span>
            <h2 id="hero-title">
              Every life.
              <br />
              An untold story.
            </h2>
            <p>
              A hunter. A healer. A craftsperson. A civilian.
              <br className={styles.desktopBreak} /> Your place in this world will be yours to
              discover.
            </p>
            <div className={styles.heroNotice}>
              <Icon name="lock" width="16" height="16" />
              <span>Account access is available. Character creation is not enabled yet.</span>
            </div>
          </div>
          <div className={styles.heroFooter}>
            <span>HUNTER WORLD</span>
            <span>PERSISTENT WORLD · SHARED STORIES</span>
          </div>
        </section>
        <div className={styles.sidePanels}>
          <ConnectionPanel />
          <section className={styles.characterPanel} aria-labelledby="character-title">
            <div className={styles.panelHeading}>
              <h2 id="character-title">Your character</h2>
              <span className={styles.smallLabel}>UNAVAILABLE</span>
            </div>
            <p>Your identity and condition will live here once character creation is available.</p>
            <Link className={styles.quickLink} to="/body">
              <Icon name="body" />
              <span>Body status</span>
              <Icon name="arrow" width="16" height="16" />
            </Link>
            <Link className={styles.quickLink} to="/identity">
              <Icon name="identity" />
              <span>System ID</span>
              <Icon name="arrow" width="16" height="16" />
            </Link>
          </section>
        </div>
      </div>
      <section className={styles.modules} aria-labelledby="modules-title">
        <div className={styles.sectionHeading}>
          <h2 id="modules-title">Explore the System</h2>
          <span>Built for the journey ahead</span>
        </div>
        <div className={styles.moduleGrid}>
          {[
            { key: 'map', description: 'Discover the world around you.' },
            { key: 'activity', description: 'Follow your unfolding story.' },
            { key: 'community', description: 'Connect through shared knowledge.' },
            { key: 'inventory', description: 'Prepare for the path you choose.' },
          ].map(({ key, description }) => {
            const screen = plannedScreens[key as keyof typeof plannedScreens];
            return (
              <Link to={`/${key}`} className={styles.moduleCard} key={key}>
                <div className={styles.moduleTop}>
                  <Icon name={screen.icon} width="23" height="23" />
                  <Icon name="arrow" width="16" height="16" />
                </div>
                <h3>{screen.title}</h3>
                <p>{description}</p>
                <span className={styles.moduleStatus}>Not available yet</span>
              </Link>
            );
          })}
        </div>
      </section>
      <div className={styles.foundationNote}>
        <Icon name="shield" width="18" height="18" />
        <p>
          <strong>An honest beginning.</strong> Account access can now be established. Persistent
          character identity and gameplay still come next.
        </p>
      </div>
    </>
  );
}

function PlannedScreen({
  screen,
}: {
  screen: (typeof plannedScreens)[keyof typeof plannedScreens];
}) {
  return (
    <>
      <div className={styles.pageIntro}>
        <div>
          <p className={styles.eyebrow}>YOUR SYSTEM</p>
          <h1>
            {screen.title}
            <span>.</span>
          </h1>
        </div>
        <span className={styles.releaseTag}>FOUNDATION RELEASE</span>
      </div>
      <section className={styles.unavailablePanel} aria-labelledby="unavailable-title">
        <div className={styles.unavailableIcon}>
          <Icon name={screen.icon} width="38" height="38" />
        </div>
        <p className={styles.eyebrow}>{screen.eyebrow}</p>
        <h2 id="unavailable-title">{screen.heading}</h2>
        <p className={styles.unavailableDescription}>{screen.description}</p>
        <div className={styles.unavailableNotice}>
          <Icon name="lock" width="17" height="17" />
          <p>{screen.note}</p>
        </div>
        <Link className={styles.primaryLink} to="/">
          Return to System
          <Icon name="arrow" width="17" height="17" />
        </Link>
      </section>
    </>
  );
}

function NotFoundScreen() {
  return (
    <section className={styles.unavailablePanel}>
      <p className={styles.eyebrow}>PAGE NOT FOUND</p>
      <h1>This path is uncharted.</h1>
      <p>The page you requested could not be found.</p>
      <Link className={styles.primaryLink} to="/">
        Return to System
        <Icon name="arrow" />
      </Link>
    </section>
  );
}

export function App() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const previousPath = useRef(location.pathname);
  const currentTitle =
    navigation.find((item) => item.path === location.pathname)?.label ??
    plannedScreens[location.pathname.slice(1) as keyof typeof plannedScreens]?.title ??
    accountTitles[location.pathname] ??
    'Page not found';

  useEffect(() => {
    document.title = `${currentTitle} · Hunter World`;
    if (previousPath.current !== location.pathname) {
      mainRef.current?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
      previousPath.current = location.pathname;
    }
  }, [currentTitle, location.pathname]);

  return (
    <div className={styles.app}>
      <a className="hw-skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className={styles.sidebar}>
        <Link to="/" className={styles.brand} aria-label="Hunter World System home">
          <SystemMark />
          <span>
            HUNTER<span>WORLD</span>
          </span>
        </Link>
        <p className={styles.navLabel}>SYSTEM INTERFACE</p>
        <nav className={styles.navigation} aria-label="Main navigation">
          {navigation.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
              }
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <span className={styles.foundationSymbol}>◇</span>
          <p>
            THE WORLD IS TAKING SHAPE<span>Foundation release</span>
          </p>
        </div>
      </aside>
      <div className={styles.mainColumn}>
        <header className={styles.topbar}>
          <div className={styles.breadcrumb}>
            <span>SYSTEM</span>
            <span>/</span>
            <span>{currentTitle}</span>
          </div>
          <Link to="/" className={styles.mobileBrand} aria-label="Hunter World System home">
            <SystemMark />
            <span>HUNTER WORLD</span>
          </Link>
          <div className={styles.headerActions}>
            <NavLink to="/body" aria-label="Open body status">
              <Icon name="body" />
              <span>Body status</span>
            </NavLink>
            <NavLink to="/identity" aria-label="Open System ID">
              <Icon name="identity" />
              <span>System ID</span>
            </NavLink>
            <AccountControl />
          </div>
        </header>
        <main id="main-content" className={styles.main} ref={mainRef} tabIndex={-1}>
          <Routes>
            <Route path="/" element={<SystemScreen />} />
            {Object.entries(plannedScreens).map(([path, screen]) => (
              <Route key={path} path={`/${path}`} element={<PlannedScreen screen={screen} />} />
            ))}
            <Route path="/account/sign-in" element={<AccountAccess mode="sign-in" />} />
            <Route path="/account/register" element={<AccountAccess mode="register" />} />
            <Route path="/account/recovery" element={<Recovery />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="*" element={<NotFoundScreen />} />
          </Routes>
          <footer className={styles.footer}>
            <span>HUNTER WORLD</span>
            <span>A world to live in. A story to make your own.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
