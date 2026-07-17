/**
 * One failure classifier for every surface that shows AI errors — the chat
 * ErrorCard and the settings connect flow read the SAME mapping, so an auth
 * failure never reads friendly in one place and cryptic in the other.
 */

import { t } from '../i18n'
import type { ErrorInfo } from '../composables/useConversationHistory'

export const classifyError = (raw: string): ErrorInfo => {
  if (/\b401\b|\b403\b|rejected|User not found|MODEL_AUTHENTICATION|api[_ ]?key/i.test(raw)) {
    return {
      title: t('biscuit.errorTitleAuth'),
      explanation: t('biscuit.errorExplainAuth'),
      showSettings: true
    }
  }
  if (/\b429\b|rate.?limit|quota|overloaded|insufficient/i.test(raw)) {
    return {
      title: t('biscuit.errorTitleRate'),
      explanation: t('biscuit.errorExplainRate')
    }
  }
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|Could not reach|fetch failed|network|timeout/i.test(raw)) {
    return {
      title: t('biscuit.errorTitleNetwork'),
      explanation: t('biscuit.errorExplainNetwork'),
      showSettings: true
    }
  }
  return {
    title: t('biscuit.errorTitleGeneric'),
    explanation: t('biscuit.errorExplainGeneric')
  }
}
