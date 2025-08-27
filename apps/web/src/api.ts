export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'
export const ORG_ID = import.meta.env.VITE_ORG_ID || 'seed-org'

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-org-id': ORG_ID,
      ...(init.headers || {}),
    },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
