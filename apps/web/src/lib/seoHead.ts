import { parseLocation } from './appRoutes';

const DEFAULT_TITLE = 'Hin — Social Media Platform';

export function titleForRoute(pathname: string, hash: string): string {
  const route = parseLocation(pathname, hash);
  if (route.view === 'post') {
    return `Post on Hin`;
  }
  if (route.view === 'profile') {
    return `@${route.username} on Hin`;
  }
  if (route.view === 'search') {
    return 'Search — Hin';
  }
  if (route.view === 'olabid') {
    return route.itemId ? `Olabid item — Hin` : 'Olabid — Hin';
  }
  if (route.view === 'admin') {
    return 'Admin — Hin';
  }
  return DEFAULT_TITLE;
}

export function applyDocumentTitle(pathname = window.location.pathname, hash = window.location.hash): void {
  document.title = titleForRoute(pathname, hash);
}

export function installSeoHeadSync(): void {
  applyDocumentTitle();

  const sync = () => applyDocumentTitle();
  window.addEventListener('popstate', sync);

  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = (...args) => {
    originalPushState(...args);
    sync();
  };

  history.replaceState = (...args) => {
    originalReplaceState(...args);
    sync();
  };
}
