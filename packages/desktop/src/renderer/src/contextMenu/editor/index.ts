/**
 * Context menu for the WYSIWYG writing page ("manuscript mode") — the one
 * surface a writer right-clicks most that previously showed nothing.
 * Cut/copy/paste/select-all ride Electron roles (native clipboard, no
 * plumbing); the selection can be handed to Biscuit in one click.
 */

import { popupContextMenu } from '../popupMenu'
import bus from '../../bus'
import { t } from '../../i18n'

export const showEditorContextMenu = (event: MouseEvent): void => {
  const selection = (window.getSelection()?.toString() ?? '').trim()
  const hasSelection = selection.length > 0

  popupContextMenu(
    [
      { role: 'cut', label: t('contextMenu.editor.cut'), enabled: hasSelection },
      { role: 'copy', label: t('contextMenu.editor.copy'), enabled: hasSelection },
      { role: 'paste', label: t('contextMenu.editor.paste') },
      { type: 'separator' },
      { role: 'selectAll', label: t('contextMenu.editor.selectAll') },
      { type: 'separator' },
      {
        label: t('contextMenu.editor.askBiscuit'),
        enabled: hasSelection,
        click: () => {
          const excerpt = selection.length > 1200 ? `${selection.slice(0, 1200)}…` : selection
          bus.emit(
            'biscuit-ask',
            `${t('contextMenu.editor.askBiscuitPrompt')}\n\n"${excerpt}"`
          )
        }
      }
    ],
    { x: event.clientX, y: event.clientY }
  )
}
