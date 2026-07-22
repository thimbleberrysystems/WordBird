/**
 * Typed reader/updater for `.wordbird/project.json` — the project's
 * identity card: name, flavor, and the writer's METHOD (planning style +
 * structure template). Legacy markers carry only {name, createdAt, flavor};
 * everything else falls back to 'unset' so old projects keep working.
 */

import path from 'path'
import fs from 'fs'
import fsPromises from 'fs/promises'
import type {
  IProjectMeta,
  PlanningStyle,
  ProjectFlavor,
  StructureTemplate
} from '../../../shared/types/novel'
import { writeFileDurable } from '../../filesystem/atomic'

const markerPath = (root: string): string => path.join(root, '.wordbird', 'project.json')

const PLANNING_STYLES: PlanningStyle[] = ['outline-first', 'discovery', 'hybrid', 'unset']
const STRUCTURE_TEMPLATES_IDS: StructureTemplate[] = [
  'freeform',
  'three-act',
  'save-the-cat',
  'heros-journey',
  'seven-point',
  'romancing-the-beat',
  'unset'
]
const FLAVORS: ProjectFlavor[] = ['chapters-scenes', 'scene-pool', 'flat']

export const isPlanningStyle = (value: unknown): value is PlanningStyle =>
  PLANNING_STYLES.includes(value as PlanningStyle)

export const isStructureTemplate = (value: unknown): value is StructureTemplate =>
  STRUCTURE_TEMPLATES_IDS.includes(value as StructureTemplate)

export const readProjectMeta = (root: string): IProjectMeta => {
  const fallback: IProjectMeta = {
    name: path.basename(root),
    flavor: 'chapters-scenes',
    planningStyle: 'unset',
    structureTemplate: 'unset'
  }
  try {
    const raw = JSON.parse(fs.readFileSync(markerPath(root), 'utf8')) as Record<string, unknown>
    return {
      name: typeof raw.name === 'string' && raw.name ? raw.name : fallback.name,
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
      flavor: FLAVORS.includes(raw.flavor as ProjectFlavor)
        ? (raw.flavor as ProjectFlavor)
        : fallback.flavor,
      planningStyle: isPlanningStyle(raw.planningStyle) ? raw.planningStyle : 'unset',
      structureTemplate: isStructureTemplate(raw.structureTemplate)
        ? raw.structureTemplate
        : 'unset'
    }
  } catch {
    return fallback
  }
}

export const updateProjectMeta = async(
  root: string,
  patch: Partial<Pick<IProjectMeta, 'planningStyle' | 'structureTemplate' | 'name'>>
): Promise<IProjectMeta> => {
  const current = readProjectMeta(root)
  // Preserve any unknown keys a future version may have written.
  let raw: Record<string, unknown> = {}
  try {
    raw = JSON.parse(fs.readFileSync(markerPath(root), 'utf8')) as Record<string, unknown>
  } catch {
    // Legacy/missing marker — rebuild from the typed view.
    raw = { name: current.name, createdAt: current.createdAt, flavor: current.flavor }
  }
  const next = { ...raw, ...patch }
  await fsPromises.mkdir(path.dirname(markerPath(root)), { recursive: true })
  await writeFileDurable(markerPath(root), JSON.stringify(next, null, 2))
  return readProjectMeta(root)
}
