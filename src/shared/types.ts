export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export interface SendRequestInput {
  method: HttpMethod
  url: string
  headers: { key: string; value: string }[]
  body?: string
  timeoutMs?: number
}

export type SendRequestResult =
  | {
      ok: true
      status: number
      statusText: string
      headers: Record<string, string>
      body: string
      timeMs: number
      sizeBytes: number
    }
  | {
      ok: false
      error: string
      timeMs: number
    }