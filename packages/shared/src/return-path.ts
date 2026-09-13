/** Allow only the client portal's exact local routes after authentication. */
export function requestReturnPath(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() === value && /^\/(?:inbox|requests(?:\/[A-Za-z0-9-]+)?)$/.test(value) ? value : undefined;
}

/** Same-origin application deep links. Role routing is checked after identity resolves. */
export function appReturnPath(value: unknown): string | undefined {
  if (requestReturnPath(value)) return value as string;
  return typeof value === 'string' && value.trim() === value && /^\/(?:|work|repository|reports|contracts\/[A-Za-z0-9-]+)$/.test(value) ? value : undefined;
}
export function signedInHome(role: string, returnTo?: unknown): string {
  return role === 'requester' ? requestReturnPath(returnTo) ?? '/requests' : appReturnPath(returnTo) ?? '/';
}
