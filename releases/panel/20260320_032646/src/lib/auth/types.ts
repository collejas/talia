export type SupabaseTokenResponse = {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token: string
  user: {
    id: string
    email: string
    aud: string
    [key: string]: unknown
  }
}

export type SupabaseErrorResponse = {
  error_description?: string
  error?: string
  message?: string
}
