export type AppRoute =
  | { view: 'home' }
  | { view: 'post'; postId: number; commentId?: number }
  | { view: 'profile'; username: string };

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,30}$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

export function parseLocation(pathname: string, hash: string): AppRoute {
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

  return { view: 'home' };
}

export function postPath(postId: number, commentId?: number): string {
  const base = `/post/${postId}`;
  return commentId ? `${base}#comment-${commentId}` : base;
}

export function profilePath(username: string): string {
  return `/profile/${encodeURIComponent(username)}`;
}

export function routeToPath(route: AppRoute): string {
  if (route.view === 'post') {
    return postPath(route.postId, route.commentId);
  }
  if (route.view === 'profile') {
    return profilePath(route.username);
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
