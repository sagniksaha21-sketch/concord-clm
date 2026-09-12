/** Allow only the client portal's exact local routes after authentication. */
export function requestReturnPath(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() === value && /^\/(?:inbox|requests(?:\/[A-Za-z0-9-]+)?)$/.test(value) ? value : undefined;
}
