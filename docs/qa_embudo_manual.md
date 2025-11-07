# QA embudo · Checklist sugerida

## 1. Preparación
- Ejecutar pruebas automáticas: `npm run lint` y `npm run build --webpack`.
- Confirmar que la migración `20251204_130000_panel_lead_history.sql` ya se aplicó en Supabase.

## 2. Escenarios funcionales
1. **Edición básica**
   - Abrir un lead, modificar nombre/correo/teléfono, guardar.
   - Verificar que los cambios aparecen en la tarjeta y en Supabase (`lead_tarjetas`, `contactos`).
2. **Stage prep (drawer_prep)**
   - Capturar datos en “Próximas etapas” (por ejemplo, Demo).
   - Guardar y confirmar que `metadata.stage_prep` refleje los valores (`select metadata->'stage_prep'...`).
3. **Notas e historial**
   - En la pestaña Notas, crear una nota nueva.
   - Validar que aparezca en Notas/Historial y que exista registro en `lead_movimientos` con `metadata->>'nota'`.
4. **Drag & drop**
   - Mover un lead a otra etapa permitida y verificar actualización inmediata + registro en historial.
   - Intentar mover a etapa bloqueada (orden < 2) y confirmar mensaje preventivo.

## 3. Accessibilidad & UX
- Navegación con teclado (foco visible en tabs, inputs y botones).
- Verificar que modales/drawer cierran con `Esc` y devuelven foco a la tarjeta.
- (Opcional) Probar con lector de pantalla que títulos y labels sean claros.

## 4. Integridad de datos
- Consultar `panel_lead_movimientos` directamente y confirmar respuesta coincide con el frontend.
- Revisar que `lead_movimientos` conserve `metadata.tipo` (`movimiento` vs `nota`) y mantenga orden cronológico.

## 5. Post-QA
- Si todo pasa, actualizar `docs/embudo_interactivo_plan.md` marcando QA completado.
- Registrar observaciones o bugs detectados para seguimiento.
