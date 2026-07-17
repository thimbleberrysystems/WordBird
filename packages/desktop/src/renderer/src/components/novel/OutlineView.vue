<template>
  <div class="outline-view">
    <empty-state
      v-if="rows.length === 0"
      icon="📋"
      :title="t('empty.outlineTitle')"
      :hint="t('empty.outlineHint')"
    />
    <table
      v-else
      class="outline-table"
    >
      <thead>
        <tr>
          <th class="col-title">
            {{ t('views.colTitle') }}
          </th>
          <th class="col-pov">
            POV
          </th>
          <th class="col-location">
            {{ t('views.colLocation') }}
          </th>
          <th class="col-status">
            {{ t('views.colStatus') }}
          </th>
          <th class="col-thread">
            {{ t('views.colThread') }}
          </th>
          <th class="col-label">
            {{ t('views.colLabel') }}
          </th>
          <th class="col-words">
            {{ t('views.colWords') }}
          </th>
          <th class="col-synopsis">
            {{ t('views.colSynopsis') }}
          </th>
          <th class="col-notes">
            {{ t('views.colNotes') }}
          </th>
        </tr>
      </thead>
      <tbody>
        <template
          v-for="row in rows"
          :key="row.unit.id"
        >
          <tr
            v-if="row.isHeader"
            class="group-row"
          >
            <td colspan="9">
              {{ row.label }}
            </td>
          </tr>
          <tr
            v-else
            class="scene-row"
            @contextmenu.prevent="showRowMenu($event, row.unit)"
          >
            <td
              class="col-title clickable"
              :style="{ paddingLeft: `${row.depth * 16 + 10}px` }"
              @click="novelStore.openUnit(row.unit)"
            >
              {{ row.unit.title }}
            </td>
            <td class="col-pov">
              <input
                class="cell-input"
                :value="row.unit.pov ?? ''"
                @change="save(row.unit, 'pov', $event)"
              >
            </td>
            <td class="col-location">
              <input
                class="cell-input"
                :value="row.unit.location ?? ''"
                @change="save(row.unit, 'location', $event)"
              >
            </td>
            <td class="col-status">
              <select
                class="cell-select"
                :value="row.unit.status ?? 'idea'"
                @change="save(row.unit, 'status', $event)"
              >
                <option value="idea">
                  idea
                </option>
                <option value="draft">
                  draft
                </option>
                <option value="revised">
                  revised
                </option>
                <option value="final">
                  final
                </option>
              </select>
            </td>
            <td class="col-thread">
              <input
                class="cell-input"
                :value="row.unit.thread ?? ''"
                @change="save(row.unit, 'thread', $event)"
              >
            </td>
            <td class="col-label">
              <input
                class="cell-input"
                :value="row.unit.label ?? ''"
                @change="save(row.unit, 'label', $event)"
              >
            </td>
            <td class="col-words">
              {{ row.unit.wordCount ?? 0 }}
            </td>
            <td class="col-synopsis">
              <input
                class="cell-input"
                :value="row.unit.synopsis ?? ''"
                :placeholder="t('views.noSynopsis')"
                @change="save(row.unit, 'synopsis', $event)"
              >
            </td>
            <td class="col-notes">
              <input
                class="cell-input"
                :value="row.unit.notes ?? ''"
                :placeholder="t('views.noNotes')"
                @change="save(row.unit, 'notes', $event)"
              >
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import EmptyState from '../common/EmptyState.vue'
import { popupContextMenu } from '../../contextMenu/popupMenu'
import { ElMessageBox } from 'element-plus'
import { useNovelStore } from '@/store/novel'
import { t } from '../../i18n'
import type { INovelUnit, INovelUnitUpdate } from '@shared/types/novel'

const novelStore = useNovelStore()
const { structure } = storeToRefs(novelStore)

interface OutlineRow {
  unit: INovelUnit
  isHeader: boolean
  label?: string
  depth: number
}

const rows = computed<OutlineRow[]>(() => {
  const out: OutlineRow[] = []
  const walk = (units: INovelUnit[], depth: number, trail: string[]): void => {
    for (const unit of units) {
      if (unit.path) {
        out.push({ unit, isHeader: false, depth })
      } else {
        out.push({
          unit,
          isHeader: true,
          label: [...trail, unit.title].join(' · '),
          depth
        })
        walk(unit.children ?? [], depth + 1, [...trail, unit.title])
      }
    }
  }
  walk(structure.value?.units ?? [], 0, [])
  return out
})

onMounted(() => {
  novelStore.refresh()
})

const save = (unit: INovelUnit, field: keyof INovelUnitUpdate, event: Event): void => {
  const value = (event.target as HTMLInputElement | HTMLSelectElement).value
  novelStore.updateUnit(unit.id, { [field]: value })
}

const showRowMenu = (event: MouseEvent, unit: INovelUnit): void => {
  popupContextMenu(
    [
      { label: t('binder.open'), click: () => novelStore.openUnit(unit) },
      { type: 'separator' },
      {
        label: t('binder.delete'),
        click: async () => {
          try {
            await ElMessageBox.confirm(
              t('binder.deleteConfirm', { title: unit.title }),
              t('binder.delete'),
              { type: 'warning' }
            )
          } catch {
            return
          }
          await novelStore.deleteUnit(unit.id, true)
        }
      }
    ],
    { x: event.clientX, y: event.clientY }
  )
}
</script>

<style scoped>
.outline-view {
  flex: 1;
  overflow: auto;
  padding: 40px 24px 24px;
  background: var(--editorBgColor);
}

.outline-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  color: var(--editorColor);
}

.outline-table th {
  text-align: left;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--iconColor);
  font-weight: 600;
  padding: 6px 10px;
  border-bottom: 1px solid var(--itemBgColor);
  position: sticky;
  top: -40px;
  background: var(--editorBgColor);
}

.outline-table td {
  padding: 4px 10px;
  border-bottom: 1px solid var(--itemBgColor);
  vertical-align: middle;
}

.group-row td {
  font-weight: 600;
  font-size: 12px;
  color: var(--iconColor);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding-top: 14px;
}

.scene-row:hover td {
  background: var(--itemBgColor);
}

.clickable {
  cursor: pointer;
  &:hover {
    color: var(--themeColor);
  }
}

.col-words {
  text-align: right;
  color: var(--iconColor);
  white-space: nowrap;
}

.col-pov,
.col-location {
  width: 110px;
}

.col-thread,
.col-label {
  width: 100px;
}

.col-notes {
  min-width: 160px;
}

.col-status {
  width: 90px;
}

.col-synopsis {
  min-width: 220px;
}

.cell-input,
.cell-select {
  width: 100%;
  font: inherit;
  font-size: 12px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--editorColor);
  padding: 2px 4px;
  outline: none;
  &:hover {
    border-color: var(--itemBgColor);
  }
  &:focus {
    border-color: var(--themeColor);
    background: var(--floatBgColor, transparent);
  }
}

.cell-select {
  cursor: pointer;
  appearance: auto;
}

</style>
