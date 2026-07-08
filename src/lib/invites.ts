import crypto from 'node:crypto'

// Invite tokens: we hand the RAW token to the inviter (it lives only in the
// link) and store ONLY its SHA-256 hash in the database. That way a database
// leak can't be used to accept invites — the attacker would still need the
// original token, which we never persist.

// A URL-safe random token (~43 chars from 32 random bytes).
export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

// Deterministic hash of a token, for storage and lookup.
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// How long an invite stays valid.
export const INVITE_TTL_DAYS = 7

export function inviteExpiryDate(): string {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
}
