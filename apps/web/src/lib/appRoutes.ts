export type AdminSection = 'dashboard' | 'platform-reviver';

export type AppRoute =
  | { view: 'home' }
  | { view: 'search' }
  | { view: 'post'; postId: number; commentId?: number }
  | { view: 'profile'; username: string }
  | { view: 'admin'; section: AdminSection }
  | { view: 'olabid'; itemId?: number };

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

export function parseLocation(pathname: string, hash: string): AppRoute {
  if (/^\/search\/?$/.test(pathname)) {
    return { view: 'search' };
  }

  const olabidItemMatch = pathname.match(/^\/olabid\/(\d+)\/?$/);
  if (olabidItemMatch) {
    return { view: 'olabid', itemId: Number(olabidItemMatch[1]) };
  }

  if (/^\/olabid\/?$/.test(pathname)) {
    return { view: 'olabid' };
  }

  const postMatch = pathname.match(/^\/post\/(\d+)\/?$/);
  if (postMatch) {
    const postId = Number(postMatch[1]);
    const commentMatch = hash.match(/^#comment-(\d+)$/);
    return {
      view: 'post',
      postId,
      commentId: commentMatch ? Number(commentMatch[1]) : undefined,
    };
  }

  const profileMatch = pathname.match(/^\/profile\/([^/]+)\/?$/);
  if (profileMatch) {
    const username = decodeURIComponent(profileMatch[1]);
    if (isValidUsername(username)) {
      return { view: 'profile', username };
    }
  }

  if (/^\/admin\/platform-reviver\/?$/.test(pathname)) {
    return { view: 'admin', section: 'platform-reviver' };
  }
  if (/^\/admin\/?$/.test(pathname)) {
    return { view: 'admin', section: 'dashboard' };
  }

  return { view: 'home' };
}

export function adminPath(section: AdminSection): string {
  return section === 'platform-reviver' ? '/admin/platform-reviver' : '/admin';
}

export function postPath(postId: number, commentId?: number): string {
  const base = `/post/${postId}`;
  return commentId ? `${base}#comment-${commentId}` : base;
}

export function profilePath(username: string): string {
  return `/profile/${encodeURIComponent(username)}`;
}

export function olabidPath(itemId?: number): string {
  return itemId ? `/olabid/${itemId}` : '/olabid';
}

export function routeToPath(route: AppRoute): string {
  if (route.view === 'search') {
    return '/search';
  }
  if (route.view === 'olabid') {
    return olabidPath(route.itemId);
  }
  if (route.view === 'post') {
    return postPath(route.postId, route.commentId);
  }
  if (route.view === 'profile') {
    return profilePath(route.username);
  }
  if (route.view === 'admin') {
    return adminPath(route.section);
  }
  return '/';
}

export function syncUrl(route: AppRoute, replace = false): void {
  const path = routeToPath(route);
  const current = `${window.location.pathname}${window.location.hash}`;
  if (current === path) return;
  if (replace) {
    window.history.replaceState(null, '', path);
  } else {
    window.history.pushState(null, '', path);
  }
}

export function postPermalinkUrl(postId: number, commentId?: number): string {
  return `${window.location.origin}${postPath(postId, commentId)}`;
}

export function profilePermalinkUrl(username: string): string {
  return `${window.location.origin}${profilePath(username)}`;
}

export function olabidItemPermalinkUrl(itemId: number): string {
  return `${window.location.origin}${olabidPath(itemId)}`;
}
