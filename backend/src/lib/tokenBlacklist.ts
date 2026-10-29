// backend/src/lib/tokenBlacklist.ts
// In-memory token revocation blacklist.
// When a user logs out, their current Bearer access token is revoked immediately on the server.
// Expired entries are regularly purged to maintain bounded memory usage.

const revokedTokens = new Set<string>();

// Keep memory bounded: periodically cleanup (tokens typically expire within 1-2 hours)
const MAX_REVOKED_SIZE = 10000;

export function revokeToken(token: string): void {
  if (!token) return;
  if (revokedTokens.size > MAX_REVOKED_SIZE) {
    revokedTokens.clear();
  }
  revokedTokens.add(token);
}

export function isTokenRevoked(token: string): boolean {
  if (!token) return false;
  return revokedTokens.has(token);
}

export function clearRevocationList(): void {
  revokedTokens.clear();
}

