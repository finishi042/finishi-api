import type {
  PaymentProviderAdapter,
  CreateCheckoutParams,
  CheckoutResult,
  CancelSubscriptionParams,
  WebhookEvent,
} from '../types.js'
import { createProviderFetch } from '../../monitoring/tracked-fetch.js'

/**
 * Options for server-to-server transaction verification.
 */
export interface VerifyTransactionOpts {
  /** Full URL to the verification endpoint */
  url: string
  /** Authorization header value (e.g., 'Bearer sk_xxx') */
  authHeader: string
  /** JSON path to the status field in the response (dot-notation) */
  statusPath: string
  /** Expected success value for the status field */
  successValue: string
  /** JSON path to the amount field */
  amountPath: string
  /** JSON path to the currency field */
  currencyPath: string
  /** Expected amount (smallest currency unit) */
  expectedAmount?: number
  /** Expected currency code */
  expectedCurrency?: string
  /** Provider name for error messages */
  providerLabel: string
  /** Transaction identifier for error messages */
  transactionId: string
}

/**
 * Base class for payment provider adapters.
 *
 * Centralises the duplicated logic across Paystack and Flutterwave:
 * - Authenticated HTTP requests with error handling
 * - Server-to-server transaction verification
 * - Period-end date calculation from a base date + interval
 *
 * Concrete adapters extend this and implement provider-specific methods
 * (createCheckout, cancelSubscription, parseWebhook).
 */
export abstract class BasePaymentAdapter implements PaymentProviderAdapter {
  abstract readonly name: string

  protected readonly trackedFetch: ReturnType<typeof createProviderFetch>
  protected abstract readonly baseUrl: string
  protected abstract readonly secretKey: string

  constructor(providerName: string) {
    this.trackedFetch = createProviderFetch(providerName)
  }

  abstract createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult>
  abstract cancelSubscription(params: CancelSubscriptionParams): Promise<void>
  abstract parseWebhook(headers: Record<string, string>, body: string | Buffer): Promise<WebhookEvent>

  // ── Shared: Authenticated HTTP Request ──────────────────────────────────

  /**
   * Make an authenticated request to the provider's API.
   * Handles JSON serialisation, bearer auth, and error extraction.
   *
   * @param method HTTP method
   * @param path   Path appended to baseUrl (e.g., '/transaction/initialize')
   * @param body   Optional request body (will be JSON-stringified)
   * @param isSuccess  Provider-specific check on the parsed JSON to determine success.
   *                   Defaults to checking `res.ok`.
   */
  protected async request<T>(
    method: string,
    path: string,
    body?: unknown,
    isSuccess?: (json: any, res: Response) => boolean
  ): Promise<T> {
    const res = await this.trackedFetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    const json: any = await res.json()

    const success = isSuccess
      ? isSuccess(json, res)
      : res.ok

    if (!success) {
      const errMsg = json?.message ?? `${this.name} API ${res.status}`
      throw new Error(`${this.name} error: ${errMsg}`)
    }

    return json.data as T
  }

  // ── Shared: Server-to-Server Transaction Verification ───────────────────

  /**
   * Verify a transaction directly with the provider's API.
   * Confirms the transaction exists, is successful, and amounts/currency match.
   * Prevents webhook payload tampering.
   */
  protected async verifyTransaction(opts: VerifyTransactionOpts): Promise<void> {
    const res = await this.trackedFetch(opts.url, {
      method: 'GET',
      headers: {
        'Authorization': opts.authHeader,
      },
    })

    if (!res.ok) {
      throw new Error(`${opts.providerLabel} transaction verification failed: HTTP ${res.status}`)
    }

    const json: any = await res.json()

    // Resolve nested path (e.g., 'data.status')
    const status = resolvePath(json, opts.statusPath)
    if (status !== opts.successValue) {
      throw new Error(
        `${opts.providerLabel} transaction ${opts.transactionId} not successful (status: ${status ?? 'unknown'})`
      )
    }

    // Verify amount
    if (opts.expectedAmount !== undefined) {
      const amount = resolvePath(json, opts.amountPath)
      if (amount !== opts.expectedAmount) {
        throw new Error(
          `${opts.providerLabel} amount mismatch: expected ${opts.expectedAmount}, got ${amount}`
        )
      }
    }

    // Verify currency
    if (opts.expectedCurrency) {
      const currency = resolvePath(json, opts.currencyPath)
      if (currency !== opts.expectedCurrency.toUpperCase()) {
        throw new Error(
          `${opts.providerLabel} currency mismatch: expected ${opts.expectedCurrency}, got ${currency}`
        )
      }
    }
  }

  // ── Shared: Period End Calculation ──────────────────────────────────────

  /**
   * Calculate the subscription period end date from a base date and interval.
   * Used by normalizeEvent() in both adapters to determine current_period_end.
   */
  protected calculatePeriodEnd(baseDate: Date, interval: string): string {
    const date = new Date(baseDate)
    if (interval === 'yearly') {
      date.setFullYear(date.getFullYear() + 1)
    } else {
      date.setMonth(date.getMonth() + 1)
    }
    return date.toISOString()
  }
}

// ── Utility ─────────────────────────────────────────────────────────────────

/**
 * Resolve a dot-notation path on an object (e.g., 'data.status' → obj.data.status).
 */
function resolvePath(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => acc?.[key], obj)
}
