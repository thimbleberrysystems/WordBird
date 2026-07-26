import runSanitize from 'muya/lib/utils/dompurify'

export const PREVIEW_DOMPURIFY_CONFIG = Object.freeze({
  FORBID_ATTR: ['style', 'contenteditable'],
  ALLOW_DATA_ATTR: false,
  USE_PROFILES: {
    html: true,
    svg: true,
    svgFilters: true,
    mathMl: false
  },
  RETURN_TRUSTED_TYPE: false
})

export const EXPORT_DOMPURIFY_CONFIG = Object.freeze({
  FORBID_ATTR: ['contenteditable'],
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ['data-align'],
  USE_PROFILES: {
    html: true,
    svg: true,
    svgFilters: true,
    mathMl: false
  },
  RETURN_TRUSTED_TYPE: false,
  // Allow "file" protocol to export images on Windows (#1997).
  ALLOWED_URI_REGEXP:
    /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|file):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i // eslint-disable-line no-useless-escape
})

// Toasts/notifications render short status text. They must NOT inherit the
// export profile (which permits `style`, full SVG, and the `file:` scheme for
// image export) — a notification can carry attacker-influenced text (a
// filename, a link label, an error detail), and with webSecurity disabled a
// `file:`/CSS foothold could probe or exfiltrate local files. This is a tight
// inline allow-list: no style, no SVG, DOMPurify's default (safe) URI scheme
// set — javascript:/data:/file: on links are dropped.
export const NOTIFICATION_DOMPURIFY_CONFIG = Object.freeze({
  ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 's', 'br', 'span', 'p', 'code', 'a'],
  ALLOWED_ATTR: ['href', 'title'],
  ALLOW_DATA_ATTR: false,
  RETURN_TRUSTED_TYPE: false
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sanitize = (html: string, purifyOptions?: any): string => {
  return runSanitize(html, purifyOptions)
}
