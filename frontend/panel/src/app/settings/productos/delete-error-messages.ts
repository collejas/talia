"use client"

const DELETE_ERROR_MESSAGES: Record<string, string> = {
  linea_has_children:
    "Esta línea todavía tiene familias/modelos/productos asociados. Elimina primero esos registros antes de borrar la línea.",
  familia_has_children:
    "La familia tiene modelos o productos asociados. Elimina primero los productos y luego los modelos antes de borrar la familia.",
  modelo_has_children:
    "El modelo tiene productos asociados. Elimina primero los productos antes de borrar el modelo.",
}

export function formatDeleteErrorMessage(message: string): string {
  return DELETE_ERROR_MESSAGES[message] ?? message
}
