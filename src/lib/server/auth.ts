/** Privileged APIs require an explicitly configured key in a request header. */
export function isAdminRequest(request: Request): boolean {
  const expected = process.env.ADMIN_KEY;
  return Boolean(expected && request.headers.get("x-admin-key") === expected);
}
