import {
  Folder as FilesIcon,
  Search as SearchIcon,
  Memo as TocIcon,
  Setting as SettingIcon,
  Promotion as BiscuitIcon
} from '@element-plus/icons-vue'
import { t } from '@/i18n'

export interface SideBarIconEntry {
  id: string
  name: () => string
  icon: unknown
}

export const sideBarIcons: SideBarIconEntry[] = [
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
  }
]

export const sideBarBottomIcons: SideBarIconEntry[] = [
  {
    id: 'biscuit',
    name: () => t('sideBar.icons.biscuit'),
    icon: BiscuitIcon
  },
  {
    id: 'settings',
    name: () => t('sideBar.icons.settings'),
    icon: SettingIcon
  }
]
