/**
 * Comprehensive language list for i18n/localization.
 * Each entry includes the ISO 639-1 code, English name, native name, and text direction.
 */

export interface Language {
  code: string        // ISO 639-1
  name: string        // English name
  nativeName: string  // Name in its own language
  dir: 'ltr' | 'rtl' // Text direction
}

export const languages: Language[] = [
  // Major world languages
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr' },
  { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', dir: 'ltr' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', dir: 'ltr' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', dir: 'ltr' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', dir: 'ltr' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', dir: 'ltr' },
  { code: 'zh', name: 'Chinese (Simplified)', nativeName: '中文（简体）', dir: 'ltr' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', nativeName: '中文（繁體）', dir: 'ltr' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', dir: 'ltr' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', dir: 'ltr' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', dir: 'rtl' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', dir: 'ltr' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', dir: 'ltr' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', dir: 'rtl' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', dir: 'ltr' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', dir: 'ltr' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', dir: 'ltr' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', dir: 'ltr' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', dir: 'ltr' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', dir: 'ltr' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', dir: 'ltr' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština', dir: 'ltr' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', dir: 'ltr' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk', dir: 'ltr' },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk', dir: 'ltr' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi', dir: 'ltr' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', dir: 'ltr' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', dir: 'rtl' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', dir: 'rtl' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', dir: 'ltr' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', dir: 'ltr' },
  { code: 'tl', name: 'Filipino', nativeName: 'Filipino', dir: 'ltr' },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', dir: 'ltr' },
  { code: 'am', name: 'Amharic', nativeName: 'አማርኛ', dir: 'ltr' },
  { code: 'ha', name: 'Hausa', nativeName: 'Hausa', dir: 'ltr' },
  { code: 'yo', name: 'Yoruba', nativeName: 'Yorùbá', dir: 'ltr' },
  { code: 'ig', name: 'Igbo', nativeName: 'Igbo', dir: 'ltr' },
  { code: 'zu', name: 'Zulu', nativeName: 'isiZulu', dir: 'ltr' },
  { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans', dir: 'ltr' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', dir: 'ltr' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', dir: 'ltr' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी', dir: 'ltr' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', dir: 'ltr' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', dir: 'ltr' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', dir: 'ltr' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', dir: 'ltr' },
  { code: 'my', name: 'Burmese', nativeName: 'မြန်မာ', dir: 'ltr' },
  { code: 'km', name: 'Khmer', nativeName: 'ខ្មែរ', dir: 'ltr' },
  { code: 'si', name: 'Sinhala', nativeName: 'සිංහල', dir: 'ltr' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली', dir: 'ltr' },
  { code: 'ka', name: 'Georgian', nativeName: 'ქართული', dir: 'ltr' },
  { code: 'hy', name: 'Armenian', nativeName: 'Հայերեն', dir: 'ltr' },
  { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycan', dir: 'ltr' },
  { code: 'uz', name: 'Uzbek', nativeName: 'Oʻzbek', dir: 'ltr' },
  { code: 'kk', name: 'Kazakh', nativeName: 'Қазақ', dir: 'ltr' },
  { code: 'sr', name: 'Serbian', nativeName: 'Српски', dir: 'ltr' },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski', dir: 'ltr' },
  { code: 'bg', name: 'Bulgarian', nativeName: 'Български', dir: 'ltr' },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina', dir: 'ltr' },
  { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių', dir: 'ltr' },
  { code: 'lv', name: 'Latvian', nativeName: 'Latviešu', dir: 'ltr' },
  { code: 'et', name: 'Estonian', nativeName: 'Eesti', dir: 'ltr' },
  { code: 'ca', name: 'Catalan', nativeName: 'Català', dir: 'ltr' },
]

/**
 * Default/fallback language.
 */
export const defaultLanguage: Language = languages[0]

/**
 * Get a language by code.
 */
export function getLanguage(code: string): Language | undefined {
  return languages.find(l => l.code === code)
}

/**
 * Language codes grouped by region (useful for UI grouping).
 */
export const languageRegions: Record<string, string[]> = {
  'Popular': ['en', 'es', 'fr', 'de', 'pt', 'zh', 'ja', 'ko', 'ar', 'hi'],
  'Europe': ['it', 'nl', 'ru', 'pl', 'uk', 'ro', 'el', 'cs', 'sv', 'da', 'no', 'fi', 'hu', 'tr', 'sr', 'hr', 'bg', 'sk', 'lt', 'lv', 'et', 'ca'],
  'Asia': ['zh-TW', 'ja', 'ko', 'hi', 'bn', 'ur', 'vi', 'th', 'id', 'ms', 'tl', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'my', 'km', 'si', 'ne', 'ka', 'hy', 'az', 'uz', 'kk'],
  'Middle East': ['ar', 'he', 'fa', 'ur'],
  'Africa': ['sw', 'am', 'ha', 'yo', 'ig', 'zu', 'af'],
}
