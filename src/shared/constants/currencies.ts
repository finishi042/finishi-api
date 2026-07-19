/**
 * Comprehensive currency list for billing/pricing.
 * Each entry includes ISO 4217 code, symbol, name, decimal places,
 * and a sample format for display purposes.
 */

export interface Currency {
  code: string          // ISO 4217
  symbol: string        // Currency symbol
  name: string          // Full English name
  decimals: number      // Decimal places (0 for JPY, KRW, etc.)
  symbolPosition: 'before' | 'after'
  thousandSep: string   // Thousands separator
  decimalSep: string    // Decimal separator
}

export const currencies: Currency[] = [
  // Major currencies
  { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2, symbolPosition: 'before', thousandSep: '.', decimalSep: ',' },
  { code: 'GBP', symbol: '£', name: 'British Pound', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', decimals: 0, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', decimals: 2, symbolPosition: 'before', thousandSep: "'", decimalSep: '.' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },

  // Asian currencies
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won', decimals: 0, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'TWD', symbol: 'NT$', name: 'Taiwan Dollar', decimals: 0, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah', decimals: 0, symbolPosition: 'before', thousandSep: '.', decimalSep: ',' },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong', decimals: 0, symbolPosition: 'after', thousandSep: '.', decimalSep: ',' },
  { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'LKR', symbol: 'Rs', name: 'Sri Lankan Rupee', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'MMK', symbol: 'K', name: 'Myanmar Kyat', decimals: 0, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'NPR', symbol: '₨', name: 'Nepalese Rupee', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },

  // Middle East / North Africa
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'QAR', symbol: 'ر.ق', name: 'Qatari Riyal', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'KWD', symbol: 'د.ك', name: 'Kuwaiti Dinar', decimals: 3, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'BHD', symbol: '.د.ب', name: 'Bahraini Dinar', decimals: 3, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'OMR', symbol: 'ر.ع', name: 'Omani Rial', decimals: 3, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'MAD', symbol: 'د.م.', name: 'Moroccan Dirham', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'ILS', symbol: '₪', name: 'Israeli Shekel', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira', decimals: 2, symbolPosition: 'before', thousandSep: '.', decimalSep: ',' },

  // African currencies
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'TZS', symbol: 'TSh', name: 'Tanzanian Shilling', decimals: 0, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'UGX', symbol: 'USh', name: 'Ugandan Shilling', decimals: 0, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'ETB', symbol: 'Br', name: 'Ethiopian Birr', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'XOF', symbol: 'CFA', name: 'West African CFA Franc', decimals: 0, symbolPosition: 'after', thousandSep: '.', decimalSep: ',' },
  { code: 'XAF', symbol: 'FCFA', name: 'Central African CFA Franc', decimals: 0, symbolPosition: 'after', thousandSep: '.', decimalSep: ',' },
  { code: 'RWF', symbol: 'RF', name: 'Rwandan Franc', decimals: 0, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },

  // European currencies (non-EUR)
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona', decimals: 2, symbolPosition: 'after', thousandSep: ' ', decimalSep: ',' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone', decimals: 2, symbolPosition: 'after', thousandSep: ' ', decimalSep: ',' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone', decimals: 2, symbolPosition: 'after', thousandSep: '.', decimalSep: ',' },
  { code: 'PLN', symbol: 'zł', name: 'Polish Zloty', decimals: 2, symbolPosition: 'after', thousandSep: ' ', decimalSep: ',' },
  { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna', decimals: 2, symbolPosition: 'after', thousandSep: ' ', decimalSep: ',' },
  { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint', decimals: 0, symbolPosition: 'after', thousandSep: ' ', decimalSep: ',' },
  { code: 'RON', symbol: 'lei', name: 'Romanian Leu', decimals: 2, symbolPosition: 'after', thousandSep: '.', decimalSep: ',' },
  { code: 'BGN', symbol: 'лв', name: 'Bulgarian Lev', decimals: 2, symbolPosition: 'after', thousandSep: ' ', decimalSep: ',' },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble', decimals: 2, symbolPosition: 'after', thousandSep: ' ', decimalSep: ',' },
  { code: 'UAH', symbol: '₴', name: 'Ukrainian Hryvnia', decimals: 2, symbolPosition: 'after', thousandSep: ' ', decimalSep: ',' },
  { code: 'ISK', symbol: 'kr', name: 'Icelandic Krona', decimals: 0, symbolPosition: 'after', thousandSep: '.', decimalSep: ',' },

  // Americas
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', decimals: 2, symbolPosition: 'before', thousandSep: '.', decimalSep: ',' },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'ARS', symbol: 'AR$', name: 'Argentine Peso', decimals: 2, symbolPosition: 'before', thousandSep: '.', decimalSep: ',' },
  { code: 'CLP', symbol: 'CL$', name: 'Chilean Peso', decimals: 0, symbolPosition: 'before', thousandSep: '.', decimalSep: ',' },
  { code: 'COP', symbol: 'CO$', name: 'Colombian Peso', decimals: 0, symbolPosition: 'before', thousandSep: '.', decimalSep: ',' },
  { code: 'PEN', symbol: 'S/', name: 'Peruvian Sol', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
  { code: 'UYU', symbol: '$U', name: 'Uruguayan Peso', decimals: 2, symbolPosition: 'before', thousandSep: '.', decimalSep: ',' },
  { code: 'JMD', symbol: 'J$', name: 'Jamaican Dollar', decimals: 2, symbolPosition: 'before', thousandSep: ',', decimalSep: '.' },
]

/**
 * Default currency.
 */
export const defaultCurrency: Currency = currencies[0]

/**
 * Get a currency by code.
 */
export function getCurrency(code: string): Currency | undefined {
  return currencies.find(c => c.code === code)
}

/**
 * Format an amount in a given currency.
 * @param amount - The amount in the currency's smallest unit (e.g., cents for USD)
 * @param currencyCode - ISO 4217 currency code
 * @param options - Formatting options
 */
export function formatPrice(
  amount: number,
  currencyCode: string,
  options?: { fromSmallestUnit?: boolean }
): string {
  const currency = getCurrency(currencyCode) ?? defaultCurrency
  const fromSmallest = options?.fromSmallestUnit ?? true

  // Convert from smallest unit (cents) to display amount
  const displayAmount = fromSmallest && currency.decimals > 0
    ? amount / Math.pow(10, currency.decimals)
    : amount

  // Format the number
  const parts = displayAmount.toFixed(currency.decimals).split('.')
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, currency.thousandSep)
  const decimalPart = parts[1] ?? ''

  const formattedNumber = currency.decimals > 0
    ? `${integerPart}${currency.decimalSep}${decimalPart}`
    : integerPart

  // Apply symbol position
  if (currency.symbolPosition === 'before') {
    return `${currency.symbol}${formattedNumber}`
  }
  return `${formattedNumber} ${currency.symbol}`
}

/**
 * Currencies grouped by region (useful for UI grouping).
 */
export const currencyRegions: Record<string, string[]> = {
  'Popular': ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'],
  'Americas': ['USD', 'CAD', 'BRL', 'MXN', 'ARS', 'CLP', 'COP', 'PEN', 'UYU', 'JMD'],
  'Europe': ['EUR', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'RUB', 'UAH', 'ISK'],
  'Asia Pacific': ['JPY', 'CNY', 'INR', 'KRW', 'SGD', 'HKD', 'TWD', 'THB', 'MYR', 'IDR', 'PHP', 'VND', 'PKR', 'BDT', 'AUD', 'NZD'],
  'Middle East': ['AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'EGP', 'MAD', 'ILS', 'TRY'],
  'Africa': ['NGN', 'ZAR', 'KES', 'GHS', 'TZS', 'UGX', 'ETB', 'XOF', 'XAF', 'RWF'],
}
