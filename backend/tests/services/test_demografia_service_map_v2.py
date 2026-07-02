from app.services import demografia_service


def test_build_map_v2_dataset_attaches_canonical_blocks() -> None:
    dataset = [
        {
            "key": "09",
            "name": "CDMX",
            "nivel": "estado",
            "leads_total": 3,
            "leads_totales_por_canal": {},
            "totales_por_canal": {},
            "visitantes_totales_por_canal": {},
            "conversacion_totales": {"con_conversacion": 0, "sin_conversacion": 0},
            "etapas_totales": {
                "captado": 0,
                "precalificado": 0,
                "negociacion": 0,
                "ganado": 0,
                "perdido": 0,
            },
            "visitantes_total": 0,
            "visitantes_con_chat": 0,
            "visitantes_sin_chat": 0,
            "total_visitas": 0,
            "has_data": True,
            "next_level": "municipio",
            "parent_state": None,
        }
    ]
    visitantes_payload = {
        "items": [
            {
                "key": "09",
                "sesiones_web_total": 12,
                "fuentes_top": [{"source": "google", "total": 7}],
                "utm_top": [{"utm_source": "ads", "utm_medium": "cpc", "utm_campaign": "q1", "total": 4}],
                "wa_atribucion_top": [
                    {
                        "canal_publicitario": "meta",
                        "campana_publicitaria": "prospeccion",
                        "total": 2,
                    }
                ],
                "sesiones_webchat_total": 5,
                "sesiones_con_chat_webchat": 4,
                "sesiones_sin_chat_webchat": 1,
                "conversaciones_whatsapp": 3,
                "conversaciones_voz": 1,
                "conversaciones_correo": 1,
            }
        ]
    }

    result = demografia_service.build_map_v2_dataset(
        dataset=dataset,
        visitantes_payload=visitantes_payload,
    )

    assert len(result) == 1
    row = result[0]
    assert row["traffic_web"]["sesiones_web_total"] == 12
    assert row["conversation_channels"]["conversaciones_whatsapp"] == 3
    assert row["whatsapp_atribucion"]["top"][0]["campana_publicitaria"] == "prospeccion"
    assert row["whatsapp_atribucion_top"][0]["total"] == 2
