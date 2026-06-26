import { randomUUID } from 'node:crypto'
import { db } from './db.js'
import type { Invite, Role } from './types.js'

type InviteRow = { id: string; user_id: string; email: string; role: Role; token: string; status: Invite['status']; created_at: string }

function toInvite(row: InviteRow): Invite {
  return { id: row.id, userId: row.user_id, email: row.email, role: row.role, token: row.token, status: row.status, createdAt: row.created_at }
}

export function listInvites(userId: string) {
  return (db.prepare('SELECT * FROM team_invites WHERE user_id = ? ORDER BY created_at DESC').all(userId) as InviteRow[]).map(toInvite)
}

export function createInvite(userId: string, email: string, role: Role) {
  const invite = { id: randomUUID(), userId, email: email.toLowerCase(), role, token: randomUUID(), status: 'pending' as const, createdAt: new Date().toISOString() }
  db.prepare('INSERT INTO team_invites (id, user_id, email, role, token, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    invite.id,
    invite.userId,
    invite.email,
    invite.role,
    invite.token,
    invite.status,
    invite.createdAt,
  )
  return invite
}
