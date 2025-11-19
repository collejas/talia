BEGIN;

WITH stage_updates AS (
    SELECT
        codigo,
        jsonb_build_object(
            'version', 1,
            'sections', sections
        ) AS drawer_prep
    FROM (
        VALUES
            (
                'precalificado',
                jsonb_build_array(
                    jsonb_build_object(
                        'key', 'qualification_check',
                        'title', 'Checklist de precalificación',
                        'description', 'Valida que el lead cumple los requisitos antes de avanzar.',
                        'order', 10,
                        'fields', jsonb_build_array(
                            jsonb_build_object(
                                'key', 'qualification_status',
                                'type', 'select',
                                'label', 'Estatus de precalificación',
                                'required', true,
                                'options', jsonb_build_array(
                                    jsonb_build_object('value', 'calificado', 'label', 'Calificado'),
                                    jsonb_build_object('value', 'pendiente', 'label', 'Pendiente'),
                                    jsonb_build_object('value', 'descartado', 'label', 'Descartado')
                                )
                            ),
                            jsonb_build_object(
                                'key', 'qualification_deadline',
                                'type', 'date',
                                'label', 'Fecha límite de evaluación'
                            ),
                            jsonb_build_object(
                                'key', 'qualification_notes',
                                'type', 'textarea',
                                'label', 'Notas de precalificación',
                                'placeholder', 'Puntos clave que justifican el avance.'
                            )
                        )
                    )
                )
            ),
            (
                'demo',
                jsonb_build_array(
                    jsonb_build_object(
                        'key', 'demo_planning',
                        'title', 'Preparación de la demo',
                        'description', 'Agenda y contexto necesarios para la demostración.',
                        'order', 10,
                        'fields', jsonb_build_array(
                            jsonb_build_object(
                                'key', 'demo_scheduled_at',
                                'type', 'datetime',
                                'label', 'Fecha y hora programada',
                                'required', true
                            ),
                            jsonb_build_object(
                                'key', 'demo_format',
                                'type', 'select',
                                'label', 'Modalidad',
                                'required', true,
                                'options', jsonb_build_array(
                                    jsonb_build_object('value', 'virtual', 'label', 'Virtual'),
                                    jsonb_build_object('value', 'presencial', 'label', 'Presencial'),
                                    jsonb_build_object('value', 'hibrida', 'label', 'Híbrida')
                                )
                            ),
                            jsonb_build_object(
                                'key', 'demo_link',
                                'type', 'url',
                                'label', 'Enlace o ubicación',
                                'placeholder', 'https://...'
                            ),
                            jsonb_build_object(
                                'key', 'demo_host',
                                'type', 'text',
                                'label', 'Anfitrión interno'
                            ),
                            jsonb_build_object(
                                'key', 'demo_objectives',
                                'type', 'textarea',
                                'label', 'Objetivos de la demo'
                            )
                        )
                    )
                )
            ),
            (
                'negociacion',
                jsonb_build_array(
                    jsonb_build_object(
                        'key', 'negotiation_plan',
                        'title', 'Resumen de negociación',
                        'description', 'Acordar responsables, presupuesto y próximos pasos.',
                        'order', 10,
                        'fields', jsonb_build_array(
                            jsonb_build_object(
                                'key', 'proposal_sent_at',
                                'type', 'date',
                                'label', 'Fecha de envío de propuesta'
                            ),
                            jsonb_build_object(
                                'key', 'decision_maker',
                                'type', 'text',
                                'label', 'Decisor principal'
                            ),
                            jsonb_build_object(
                                'key', 'budget_status',
                                'type', 'select',
                                'label', 'Estatus de presupuesto',
                                'options', jsonb_build_array(
                                    jsonb_build_object('value', 'aprobado', 'label', 'Aprobado'),
                                    jsonb_build_object('value', 'pendiente', 'label', 'Pendiente'),
                                    jsonb_build_object('value', 'sin_presupuesto', 'label', 'Sin presupuesto')
                                )
                            ),
                            jsonb_build_object(
                                'key', 'negotiation_notes',
                                'type', 'textarea',
                                'label', 'Notas de negociación'
                            )
                        )
                    )
                )
            ),
            (
                'cerrado_ganado',
                jsonb_build_array(
                    jsonb_build_object(
                        'key', 'closing_plan',
                        'title', 'Plan de implementación',
                        'description', 'Datos para transferir el lead a operaciones / customer success.',
                        'order', 10,
                        'fields', jsonb_build_array(
                            jsonb_build_object(
                                'key', 'close_date',
                                'type', 'date',
                                'label', 'Fecha de cierre',
                                'required', true
                            ),
                            jsonb_build_object(
                                'key', 'contract_value',
                                'type', 'number',
                                'label', 'Valor de contrato',
                                'suffix', 'MXN'
                            ),
                            jsonb_build_object(
                                'key', 'kickoff_date',
                                'type', 'date',
                                'label', 'Fecha de kickoff'
                            ),
                            jsonb_build_object(
                                'key', 'implementation_owner',
                                'type', 'text',
                                'label', 'Responsable de implementación'
                            )
                        )
                    )
                )
            ),
            (
                'cerrado_perdido',
                jsonb_build_array(
                    jsonb_build_object(
                        'key', 'loss_review',
                        'title', 'Análisis de pérdida',
                        'description', 'Aprendizajes y próximos pasos tras perder la oportunidad.',
                        'order', 10,
                        'fields', jsonb_build_array(
                            jsonb_build_object(
                                'key', 'loss_reason',
                                'type', 'select',
                                'label', 'Motivo principal',
                                'options', jsonb_build_array(
                                    jsonb_build_object('value', 'precio', 'label', 'Precio'),
                                    jsonb_build_object('value', 'tiempo', 'label', 'Tiempo / urgencia'),
                                    jsonb_build_object('value', 'competencia', 'label', 'Competencia'),
                                    jsonb_build_object('value', 'no_fit', 'label', 'Sin encaje'),
                                    jsonb_build_object('value', 'indefinido', 'label', 'No especificado')
                                )
                            ),
                            jsonb_build_object(
                                'key', 'loss_competitor',
                                'type', 'text',
                                'label', 'Competidor'
                            ),
                            jsonb_build_object(
                                'key', 'loss_reopen_date',
                                'type', 'date',
                                'label', 'Revisar de nuevo el',
                                'description', 'Fecha tentativa para retomar la conversación.'
                            ),
                            jsonb_build_object(
                                'key', 'loss_notes',
                                'type', 'textarea',
                                'label', 'Notas de cierre perdido'
                            )
                        )
                    )
                )
            )
    ) AS t(codigo, sections)
)
UPDATE public.lead_etapas AS le
SET metadatos = jsonb_set(
    COALESCE(le.metadatos, '{}'::jsonb),
    '{drawer_prep}',
    su.drawer_prep,
    true
)
FROM stage_updates su
WHERE lower(le.codigo) = su.codigo;

COMMIT;
