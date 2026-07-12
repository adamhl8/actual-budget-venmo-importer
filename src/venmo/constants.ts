export const API_BASE = "https://api.venmo.com"

export const CLIENT_ID = 1

// Headers that mimic the real Venmo iOS app as closely as possible.
// Reference: mmohades/Venmo PR #94 (default_headers.json).
// Venmo's auth endpoint rejects requests whose header set doesn't match the app's pattern
// with `error.code === 240` ("OAuth2 Exception"), so include all of them on auth calls.
export const APP_HEADERS: Record<string, string> = {
  Host: "api.venmo.com",
  "User-Agent": "Venmo/26.1.0 (iPhone; iOS 18.6.2; Scale/3.0)",
  Accept: "application/json; charset=utf-8",
  "Accept-Language": "en-US;q=1.0",
  Connection: "keep-alive",
}
