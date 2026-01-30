# Seguridad: guardar secretos por tenant en BD

Objetivo: permitir guardar tokens/llaves/contraseñas por tenant en la BD para onboarding desde UI, sin perder seguridad.

## Checklist

- [ ] Definir master key(s) globales (backend `.env`) para cifrado en aplicación
- [ ] Implementar cifrado autenticado (AEAD, ej. AES-256-GCM) antes de persistir
- [ ] Implementar rotación de secretos (guardar versionado + updated_by + updated_at)
- [ ] Confirmar que la UI nunca recibe el valor del secreto (solo “set/rotate”)
- [ ] Asegurar permisos: solo `platform_admin` puede escribir/rotar
- [ ] Auditar cambios (quién, cuándo, qué clave; sin valores)
- [ ] Definir backups y recuperación (sin exponer master keys)

## Observaciones

- [ ] (pendiente) Decisiones finales sobre algoritmo, rotación y quién administra.

## ¿Es seguro guardar secretos en BD?

Sí, puede ser seguro si cumples:
- El secreto se guarda **cifrado** (en reposo) con una master key **fuera** de la BD (solo backend).
- El backend es el único componente que puede descifrar (idealmente, ni siquiera necesita descifrar si solo reenvía al proveedor).
- Los accesos están restringidos (RLS/políticas + endpoints admin) y auditados.

No es seguro si:
- Guardas valores en texto plano.
- Expones secretos a frontend (por ejemplo cualquier `NEXT_PUBLIC_*`).
- Registras secretos en logs o errores.

## Niveles propuestos (A/B)

### Nivel A (normal)
- Cifra con `TALIA_SECRETS_MASTER_KEY`.
- Para secretos “reemplazables” o de menor impacto.

### Nivel B (seguridad extendida)
- Cifra con `TALIA_SECRETS_MASTER_KEY_HIGH` (segunda master key).
- Solo platform admin puede rotarlos.
- Para: `twilio.auth_token`, `openai.api_key` (si es por tenant), `mail.password`, `meta.messenger.app_secret`, etc.

## Reglas de implementación (mínimas)

- Nunca devolver valores descifrados por API.
- En API, permitir:
  - “set/rotate”: guarda cifrado nuevo, incrementa `version`.
  - “list”: solo `clave`, `version`, `updated_at`, `updated_by`.
  - “delete”: borra o marca como revocado.
- Logs: `clave` sí, `valor` nunca.
