export type ImporterFieldType = "text" | "number" | "boolean" | "select"

export type ImporterField = {
  id: string
  label: string
  type: ImporterFieldType
  required: boolean
  description?: string
  options?: string[]
}

export type ImporterScheme = {
  id: string
  name: string
  description?: string
  fields: ImporterField[]
}

export type ImporterImportError = {
  row: number
  message: string
  data: Record<string, string> | null
}

export type ImporterImportSummary = {
  total: number
  created: number
  updated: number
  errors: ImporterImportError[]
}
