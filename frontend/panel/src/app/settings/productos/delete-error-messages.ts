"use client"

const DELETE_ERROR_MESSAGES: Record<string, string> = {
  linea_has_children:
    "Esta línea tiene familias o modelos asociados. Elimina primero esos registros y luego vuelve a intentar.",
  familia_has_children:
    "La familia no puede borrarse mientras existan modelos o productos vinculados. Elimina los productos primero; después, puedes borrar los modelos y finalmente la familia.",
  modelo_has_children:
    "El modelo tiene productos asociados. Elimina los productos antes de borrar este modelo.",
}

function extractDeleteErrorKey(message: string): string | null {
  if (!message) return null
  const normalized = message.split(":")[0].trim().toLowerCase()
  const match = normalized.match(/\b(linea|familia|modelo)_has_children\b/)
  if (match) {
    return match[0]
  }
  return normalized || null
}

export function formatDeleteErrorMessage(message: string): string {
  const key = extractDeleteErrorKey(message)
  if (key && DELETE_ERROR_MESSAGES[key]) {
    return DELETE_ERROR_MESSAGES[key]
  }
  return message
}
