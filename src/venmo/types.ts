export interface VenmoUser {
  id: string
  username?: string
  first_name?: string
  last_name?: string
  display_name?: string
}

interface VenmoPayment {
  id: string
  status: string
  action: string
  amount: number
  note?: string
  date_completed?: string | null
  actor: VenmoUser
  target: { type?: string; user: VenmoUser }
}

export interface VenmoStory {
  id: string
  type: string
  date_created: string
  date_updated?: string
  audience?: string
  note?: string
  payment?: VenmoPayment
}

export interface VenmoStoriesResponse {
  data: VenmoStory[]
  pagination?: { older_id?: string; newer_id?: string }
}

export class VenmoAuthError extends Error {
  public override name = "VenmoAuthError"
}

export class VenmoApiError extends Error {
  public override name = "VenmoApiError"
  public readonly status: number
  public readonly body: string | undefined

  public constructor(message: string, status: number, body?: string) {
    super(message)
    this.status = status
    this.body = body
  }
}
