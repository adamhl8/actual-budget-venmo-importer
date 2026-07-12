import { input, password } from "@inquirer/prompts"

import type { Config } from "#config.ts"
import type { Logger } from "#logger.ts"
import { generateDeviceId, loginWithOtp, loginWithPassword, requestSmsOtp, trustDevice } from "#venmo/auth.ts"
import { VenmoClient } from "#venmo/client.ts"
import { saveSession, tryLoadSession } from "#venmo/session.ts"
import type { VenmoSession } from "#venmo/session.ts"

export const runAuthCommand = async (config: Config, logger: Logger): Promise<void> => {
  const existing = await tryLoadSession(config.dataDir)
  let deviceId: string
  let deviceIdSource: string
  if (config.venmoDeviceId) {
    deviceId = config.venmoDeviceId
    deviceIdSource = "env"
  } else if (existing?.deviceId) {
    ;({ deviceId } = existing)
    deviceIdSource = "session"
  } else {
    deviceId = generateDeviceId()
    deviceIdSource = "generated"
  }
  logger.info("auth.device_id", { deviceId, source: deviceIdSource })

  const username = await input({ message: "Venmo username, email, or phone:" })
  const pw = await password({ message: "Venmo password:", mask: "*" })

  logger.info("auth.attempt", { username })
  const result = await loginWithPassword({ deviceId, username, password: pw })

  let accessToken: string
  let usedOtp = false
  if (result.kind === "needs_otp") {
    logger.info("auth.otp_required", {})
    await requestSmsOtp(deviceId, result.challenge.otpSecret)
    const code = await input({
      message: "Enter the 6-digit code from your SMS:",
    })
    accessToken = await loginWithOtp({
      deviceId,
      otpSecret: result.challenge.otpSecret,
      otpCode: code.trim(),
    })
    usedOtp = true
  } else ({ accessToken } = result)

  if (usedOtp) {
    try {
      await trustDevice({ deviceId, accessToken })
      logger.info("auth.device_trusted", { deviceId })
    } catch (error: unknown) {
      logger.warn("auth.trust_device_failed", {
        err: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const session: VenmoSession = {
    accessToken,
    deviceId,
    userId: "",
    username,
    createdAt: new Date().toISOString(),
  }

  const tempClient = new VenmoClient({
    session: { ...session, userId: "placeholder" },
    logger,
  })
  const me = await tempClient.getMe()
  session.userId = me.id
  if (me.username) session.username = me.username

  await saveSession(config.dataDir, session)
  logger.info("auth.success", {
    username: session.username,
    userId: session.userId,
  })
  console.log(
    `\nAuthenticated as ${session.username} (id: ${session.userId}). Session saved to ${config.dataDir}/session.json.`,
  )
}
