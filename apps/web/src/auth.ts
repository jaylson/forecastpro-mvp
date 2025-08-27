import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
const provider = new GoogleAuthProvider()

export function login() {
  return signInWithPopup(auth, provider)
}

export function logout() {
  return signOut(auth)
}

export function onUser(cb: (u: User | null) => void) {
  return onAuthStateChanged(auth, cb)
}

export async function getIdToken(): Promise<string | null> {
  const u = auth.currentUser
  return u ? await u.getIdToken() : null
}
