const SESSION_KEY = 'selinaric_auth'
const PASSWORD = process.env.NEXT_PUBLIC_HOUSE_PASSWORD || 'selinaric'

export function checkAuth(): boolean {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(SESSION_KEY) === 'true'
}

export function login(password: string): boolean {
  if (password === PASSWORD) {
    sessionStorage.setItem(SESSION_KEY, 'true')
    return true
  }
  return false
}

export function logout(): void {
  sessionStorage.removeItem(SESSION_KEY)
}
