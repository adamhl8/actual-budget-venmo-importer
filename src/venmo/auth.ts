import { randomUUID } from "node:crypto"

import { API_BASE, APP_HEADERS, CLIENT_ID } from "#venmo/constants.ts"
import { VenmoApiError, VenmoAuthError } from "#venmo/types.ts"

const TWO_FACTOR_ERROR_CODE = 81_109

interface OtpChallenge {
  otpSecret: string
}

export type LoginResult = { kind: "success"; accessToken: string } | { kind: "needs_otp"; challenge: OtpChallenge }

export const generateDeviceId = (): string => randomUUID()

const buildAuthHeaders = (deviceId: string, extra: Record<string, string> = {}): Record<string, string> => ({
  ...APP_HEADERS,
  "Content-Type": "application/json",
  "device-id": deviceId,
  ...extra,
})

export const loginWithPassword = async (opts: {
  deviceId: string
  username: string
  password: string
}): Promise<LoginResult> => {
  const res = await fetch(`${API_BASE}/v1/oauth/access_token`, {
    method: "POST",
    headers: buildAuthHeaders(opts.deviceId),
    body: JSON.stringify({
      phone_email_or_username: opts.username,
      client_id: String(CLIENT_ID),
      password: opts.password,
    }),
  })

  const bodyText = await res.text()
  let body: unknown
  try {
    body = bodyText.length > 0 ? JSON.parse(bodyText) : {}
  } catch {
    body = {}
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const parsed = body as { error?: { code?: number }; access_token?: string }

  const errCode = parsed.error?.code
  if (errCode === TWO_FACTOR_ERROR_CODE) {
    const otpSecret = res.headers.get("venmo-otp-secret")
    if (!otpSecret) throw new VenmoAuthError("Venmo signaled 2FA but no venmo-otp-secret header was returned")

    return { kind: "needs_otp", challenge: { otpSecret } }
  }

  if (res.ok) {
    const token = parsed.access_token
    if (!token)
      throw new VenmoAuthError(`Login succeeded (${res.status}) but no access_token. Body: ${bodyText.slice(0, 500)}`)

    return { kind: "success", accessToken: token }
  }

  if (res.status === 401) throw new VenmoAuthError(`Venmo rejected credentials (401). Body: ${bodyText.slice(0, 500)}`)

  throw new VenmoApiError(
    `Venmo login failed: ${res.status} ${res.statusText}. Body: ${bodyText.slice(0, 500)}`,
    res.status,
    bodyText.slice(0, 500),
  )
}

export const requestSmsOtp = async (deviceId: string, otpSecret: string): Promise<void> => {
  const res = await fetch(`${API_BASE}/v1/account/two-factor/token`, {
    method: "POST",
    headers: buildAuthHeaders(deviceId, { "venmo-otp-secret": otpSecret }),
    body: JSON.stringify({ via: "sms" }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new VenmoApiError(
      `Failed to request SMS OTP: ${res.status} ${res.statusText}. Body: ${body.slice(0, 500)}`,
      res.status,
      body.slice(0, 500),
    )
  }
}

export const loginWithOtp = async (opts: { deviceId: string; otpSecret: string; otpCode: string }): Promise<string> => {
  const url = `${API_BASE}/v1/oauth/access_token?client_id=${CLIENT_ID}`
  const res = await fetch(url, {
    method: "POST",
    headers: buildAuthHeaders(opts.deviceId, {
      "venmo-otp": opts.otpCode,
      "venmo-otp-secret": opts.otpSecret,
    }),
  })

  const body = await res.text()
  if (!res.ok) {
    throw new VenmoApiError(
      `OTP login failed: ${res.status} ${res.statusText}. Body: ${body.slice(0, 500)}`,
      res.status,
      body.slice(0, 500),
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new VenmoAuthError(`OTP login response was not JSON: ${body.slice(0, 200)}`)
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const token = (parsed as { access_token?: string }).access_token
  if (!token) throw new VenmoAuthError(`OTP login response missing access_token: ${body.slice(0, 200)}`)

  return token
}

export const trustDevice = async (opts: { deviceId: string; accessToken: string }): Promise<void> => {
  const res = await fetch(`${API_BASE}/v1/users/devices`, {
    method: "POST",
    headers: buildAuthHeaders(opts.deviceId, {
      Authorization: `Bearer ${opts.accessToken}`,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new VenmoApiError(
      `Failed to trust device: ${res.status} ${res.statusText}. Body: ${body.slice(0, 500)}`,
      res.status,
      body.slice(0, 500),
    )
  }
}
