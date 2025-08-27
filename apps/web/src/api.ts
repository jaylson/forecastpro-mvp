export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'


import { getIdToken } from './auth'

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const orgId = localStorage.getItem('orgId') || import.meta.env.VITE_ORG_ID || 'seed-org'
  const token = await getIdToken()
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-org-id': orgId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}