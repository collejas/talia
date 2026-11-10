# Contrato de estados públicos del correo

Preparando: construcción del mensaje. En cola: persistido internamente sin
aceptación externa. Enviando: solicitud externa en curso. Enviado: aceptación
del proveedor confirmada. Entregado: evento de entrega al servidor destino.
Rebotado, error y cancelado son resultados diferentes. Un timeout externo
ambiguo requiere conciliación; no autoriza un reenvío automático.

En el modelo legado `estado=enviado` también representa una cola interna.
La API de detalle y los resúmenes deben traducir ese estado a `en_cola`
cuando sea correo Postmark sin `proveedor_aceptado_en`. Se mantiene el estado
operativo interno para evitar que un worker vuelva a reclamar el mensaje.
Los resúmenes deben paginar: un límite de 2000 no es un total de campaña.
La cola interna no debe emitir un evento SSE de campaña completada.

Entrega no implica lectura; aperturas y clics son indicadores separados.
Los entregados son un subconjunto de los aceptados y no se suman a ellos.

La consulta de atribución histórica ahora excluye la cola interna del total
aceptado mediante la migración 20261110183237. Los snapshots ya persistidos
requieren regeneración por rango; modificar la consulta no reescribe cachés.
La bitácora presenta `postmark_queued` como En cola, incluso si el mensaje
fue aceptado después: el evento histórico describe lo ocurrido en ese momento.

Pendiente: regenerar snapshots afectados, completar filtros públicos,
integrar los estados ambiguos del despacho
externo, y terminar la transición del estado agregado de campaña. No declarar
el contrato completo desplegado mientras esas rutas sigan usando estado legado.
