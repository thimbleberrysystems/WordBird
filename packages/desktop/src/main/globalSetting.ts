import path from 'path'
import { app } from 'electron'

// Set `__static` path to static files in production / development depending on the environment
// In development: use the source static directory (relative to compiled main/index.js)
// In production: use the resources static directory
const staticPath = app.isPackaged
  ? path.join(process.resourcesPath, 'static')
  : path.join(__dirname, '..', '..', 'static')

;(global as unknown as { __static: string }).__static = staticPath.replace(/\\/g, '\\\\')
