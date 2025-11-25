/**
 * Auth configuration for single-user Google login.
 * The authorized email is set via AUTHORIZED_GOOGLE_EMAIL env var during install.
 */

export function getAuthorizedEmail(): string | null {
  const email = process.env.AUTHORIZED_GOOGLE_EMAIL?.trim();
  return email && email.length > 0 ? email.toLowerCase() : null;
}

export function isEmailAuthorized(email: string): boolean {
  const authorized = getAuthorizedEmail();
  if (!authorized) {
    // No authorized email configured - deny all
    return false;
  }
  return email.toLowerCase() === authorized;
}

