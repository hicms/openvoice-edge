import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { readString, writeString, STORAGE_KEYS } from '../lib/storage.ts'
import { en } from './en.ts'
import { zh, type Resources } from './zh.ts'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: Resources }
  }
}

export const LANGUAGES = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
] as const

export type LanguageCode = (typeof LANGUAGES)[number]['code']

function detectLanguage(): LanguageCode {
  const saved = readString(STORAGE_KEYS.language)
  if (saved === 'zh' || saved === 'en') return saved
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

export function setLanguage(code: LanguageCode): void {
  writeString(STORAGE_KEYS.language, code)
  void i18n.changeLanguage(code)
  document.documentElement.lang = code === 'zh' ? 'zh-CN' : 'en'
}

export function initI18n(): void {
  const lng = detectLanguage()
  void i18n.use(initReactI18next).init({
    resources: { zh: { translation: zh }, en: { translation: en } },
    lng,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })
  document.documentElement.lang = lng === 'zh' ? 'zh-CN' : 'en'
}

export default i18n
