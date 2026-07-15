import {
  SEPARATOR,
  getCloseThis,
  getCloseOthers,
  getCloseToRight,
  getCloseToLeft,
  getCloseSaved,
  getCloseAll,
  getRENAME,
  getCopyPath,
  getShowInFolder
} from './menuItems'
import { popupContextMenu } from '../popupMenu'
import { useEditorStore } from '../../store/editor'

type MenuItemShape = {
  type?: string
  click?: (...args: unknown[]) => void
  enabled?: boolean
  [key: string]: unknown
}

const wrapClick = (item: MenuItemShape, tabId: string): MenuItemShape => {
  if (!item || item.type === 'separator') return item
  const click = item.click
  return {
    ...item,
    click: click ? () => click({ _tabId: tabId }, null) : undefined
  }
}

interface ContextMenuClickEvent {
  clientX: number
  clientY: number
}

interface TabLike {
  id: string
  pathname?: string | null
}

export const showContextMenu = (event: ContextMenuClickEvent, tab: TabLike): void => {
  const { pathname } = tab
  const closeThis = getCloseThis()
  const closeOthers = getCloseOthers()
  const closeToRight = getCloseToRight()
  const closeToLeft = getCloseToLeft()
  const closeSaved = getCloseSaved()
  const closeAll = getCloseAll()
  const rename = getRENAME()
  const copyPath = getCopyPath()
  const showInFolder = getShowInFolder()

  ;([rename, copyPath, showInFolder] as MenuItemShape[]).forEach((item) => {
    item.enabled = !!pathname
  })

  // Grey out directional closes at the ends of the strip (browser behavior).
  const tabs = useEditorStore().tabs
  const index = tabs.findIndex((f) => f.id === tab.id)
  ;(closeToRight as MenuItemShape).enabled = index !== -1 && index < tabs.length - 1
  ;(closeToLeft as MenuItemShape).enabled = index > 0
  ;(closeOthers as MenuItemShape).enabled = tabs.length > 1

  const items = [
    closeThis,
    closeOthers,
    closeToRight,
    closeToLeft,
    closeSaved,
    closeAll,
    SEPARATOR,
    rename,
    copyPath,
    showInFolder
  ].map((item) => wrapClick(item as MenuItemShape, tab.id))

  popupContextMenu(items, { x: event.clientX, y: event.clientY })
}
