import {
  Notebook as BinderIcon,
  Folder as FilesIcon,
  Search as SearchIcon,
  Memo as TocIcon,
  Clock as HistoryIcon,
  Warning as ContinuityIcon,
  Setting as SettingIcon
} from '@element-plus/icons-vue'
import { t } from '@/i18n'

export interface SideBarIconEntry {
  id: string
  name: () => string
  icon: unknown
}

export const sideBarIcons: SideBarIconEntry[] = [
  {
    id: 'binder',
    name: () => t('sideBar.icons.binder'),
    icon: BinderIcon
  },
  {
    id: 'files',
    name: () => t('sideBar.icons.files'),
    icon: FilesIcon
  },
  {
    id: 'search',
    name: () => t('sideBar.icons.search'),
    icon: SearchIcon
  },
  {
    id: 'toc',
    name: () => t('sideBar.icons.toc'),
    icon: TocIcon
  },
  {
    id: 'history',
    name: () => t('sideBar.icons.history'),
    icon: HistoryIcon
  },
  {
    id: 'continuity',
    name: () => t('sideBar.icons.continuity'),
    icon: ContinuityIcon
  }
]

export const sideBarBottomIcons: SideBarIconEntry[] = [
  {
    id: 'settings',
    name: () => t('sideBar.icons.settings'),
    icon: SettingIcon
  }
]
