export type AppRoute =
  | { view: 'home' }
  | { view: 'post'; postId: number; commentId?: number };

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
  return { view: 'home' };
}

export function postPath(postId: number, commentId?: number): string {
  const base = `/post/${postId}`;
  return commentId ? `${base}#comment-${commentId}` : base;
}

export function routeToPath(route: AppRoute): string {
  if (route.view === 'post') {
    return postPath(route.postId, route.commentId);
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
