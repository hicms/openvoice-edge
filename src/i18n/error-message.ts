import i18n from './index.ts'
import { ApiError } from '../lib/api.ts'

/** Localised, user-facing text for any failure; server wording is only used as the `{{message}}` detail. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return i18n.t(`errors.${err.code}`, { message: err.message })
  return i18n.t('errors.unknown')
}
