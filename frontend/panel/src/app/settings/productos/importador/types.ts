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
