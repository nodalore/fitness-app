export type SupabaseConfiguration =
  | { ready: true; url: string; publishableKey: string }
  | { ready: false; message: string }

// Only public browser configuration belongs here. Never include values in errors.
export function readSupabaseConfiguration(
  urlValue: string | undefined,
  keyValue: string | undefined,
): SupabaseConfiguration {
  const url = urlValue?.trim()
  const publishableKey = keyValue?.trim()

  if (!url || !publishableKey) {
    return { ready: false, message: 'Supabase is not configured. Add your project URL and publishable key to .env.local, then restart the development server.' }
  }

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
        parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new Error('Invalid project URL')
    }
  } catch {
    return { ready: false, message: 'Use your HTTPS Supabase project URL from the Connect panel, without a path or query string.' }
  }

  // This project intentionally supports only the new publishable browser keys.
  // Reject secret keys and legacy JWT keys instead of risking privileged access.
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
    return { ready: false, message: 'Use a publishable key starting with sb_publishable_. Secret, service-role, and legacy JWT keys are not accepted.' }
  }

  return { ready: true, url, publishableKey }
}
