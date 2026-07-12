import type { RouteRecordRaw } from 'vue-router'
// .vue extensions are explicit so TS resolves them through the *.vue module
// shim in src/types/renderer.d.ts. Vite handles extension-less imports at
// runtime, but vue-tsc needs the suffix.
import App from '@/pages/app.vue'
import Preference from '@/pages/preference.vue'
import General from '@/prefComponents/general/index.vue'
import Editor from '@/prefComponents/editor/index.vue'
import Markdown from '@/prefComponents/markdown/index.vue'
import SpellChecker from '@/prefComponents/spellchecker/index.vue'
import Theme from '@/prefComponents/theme/index.vue'
import Image from '@/prefComponents/image/index.vue'
import AI from '@/prefComponents/ai/index.vue'
import Keybindings from '@/prefComponents/keybindings/index.vue'

const parseSettingsPage = (type: string | null | undefined): string => {
  // mt::open-setting-window carries the target pane as `settings/<category>`
  // — land on it directly (previously only /spelling worked and every other
  // category, including the AI pane, silently fell back to General).
  const match = /\/(general|editor|markdown|spelling|theme|image|ai|keybindings)$/.exec(type ?? '')
  return match ? `/preference/${match[1]}` : '/preference'
}

const routes = (type: string | null | undefined): RouteRecordRaw[] => [
  {
    path: '/',
    redirect:
      type === 'editor' ? '/editor' : type === 'biscuit' ? '/biscuit' : parseSettingsPage(type)
  },
  {
    path: '/editor',
    component: App
  },
  {
    path: '/biscuit',
    component: () => import('@/pages/biscuit.vue')
  },
  {
    path: '/preference',
    component: Preference,
    children: [
      {
        path: '',
        component: General
      },
      {
        path: 'general',
        component: General,
        name: 'general'
      },
      {
        path: 'editor',
        component: Editor,
        name: 'editor'
      },
      {
        path: 'markdown',
        component: Markdown,
        name: 'markdown'
      },
      {
        path: 'spelling',
        component: SpellChecker,
        name: 'spelling'
      },
      {
        path: 'theme',
        component: Theme,
        name: 'theme'
      },
      {
        path: 'image',
        component: Image,
        name: 'image'
      },
      {
        path: 'ai',
        component: AI,
        name: 'ai'
      },
      {
        path: 'keybindings',
        component: Keybindings,
        name: 'keybindings'
      }
    ]
  }
]

export default routes
