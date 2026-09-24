export type AuthIntent = 'sign-in' | 'register';

const AUTH_PARAM = 'auth';

export function parseAuthIntent(search: string): AuthIntent | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const auth = params.get(AUTH_PARAM)?.toLowerCase();
  if (auth === 'register' || auth === 'signup' || params.has('register')) {
    return 'register';
  }
  if (
    auth === 'sign-in'
    || auth === 'signin'
    || auth === 'login'
    || params.has('signin')
  ) {
    return 'sign-in';
  }
  return null;
}

export function appSignInUrl(): string {
  return `/?${AUTH_PARAM}=sign-in`;
}

export function appRegisterUrl(): string {
  return `/?${AUTH_PARAM}=register`;
}

/** Remove auth query params without navigation. Returns true if URL changed. */
export function stripAuthQueryFromLocation(): boolean {
  const url = new URL(window.location.href);
  const params = url.searchParams;
  const hadAuth =
    params.has(AUTH_PARAM)
    || params.has('register')
    || params.has('signin');
  if (!hadAuth) return false;
  params.delete(AUTH_PARAM);
  params.delete('register');
  params.delete('signin');
  const qs = params.toString();
  const next = `${url.pathname}${qs ? `?${qs}` : ''}${url.hash}`;
  window.history.replaceState(null, '', next);
  return true;
}
