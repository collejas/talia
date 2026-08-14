from app.channels.whatsapp.schemas import MetaWhatsAppIncomingMessage, MetaWhatsAppStatusCallback


def test_meta_whatsapp_incoming_message_from_webhook_payload_parses_text():
    payload = {
        "entry": [
            {
                "id": "WABA_ID",
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": "5215550000000",
                                "phone_number_id": "1234567890",
                            },
                            "contacts": [
                                {
                                    "profile": {"name": "Cliente Demo"},
                                    "wa_id": "521234567890",
                                }
                            ],
                            "messages": [
                                {
                                    "from": "521234567890",
                                    "id": "wamid.TEST",
                                    "timestamp": "1710000000",
                                    "type": "text",
                                    "text": {"body": "Hola TalIA"},
                                }
                            ],
                        },
                    }
                ],
            }
        ]
    }

    messages = MetaWhatsAppIncomingMessage.from_webhook_payload(payload)

    assert len(messages) == 1
    message = messages[0]
    assert message.message_sid == "wamid.TEST"
    assert message.from_number == "521234567890"
    assert message.to_number == "5215550000000"
    assert message.phone_number_id == "1234567890"
    assert message.body == "Hola TalIA"
    assert message.wa_id == "521234567890"
    assert message.profile_name == "Cliente Demo"


def test_meta_whatsapp_incoming_message_from_webhook_payload_parses_media():
    payload = {
        "entry": [
            {
                "id": "WABA_ID",
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": "5215550000000",
                                "phone_number_id": "1234567890",
                            },
                            "contacts": [
                                {
                                    "profile": {"name": "Cliente Demo"},
                                    "wa_id": "521234567890",
                                }
                            ],
                            "messages": [
                                {
                                    "from": "521234567890",
                                    "id": "wamid.MEDIA",
                                    "timestamp": "1710000000",
                                    "type": "image",
                                    "image": {
                                        "id": "meta-media-id",
                                        "mime_type": "image/jpeg",
                                        "caption": "Foto del terreno",
                                    },
                                }
                            ],
                        },
                    }
                ],
            }
        ]
    }

    messages = MetaWhatsAppIncomingMessage.from_webhook_payload(payload)

    assert len(messages) == 1
    message = messages[0]
    assert message.num_media == 1
    assert message.media[0].provider_id == "meta-media-id"
    assert message.media[0].content_type == "image/jpeg"
    assert message.media[0].filename == "Foto del terreno"


def test_meta_whatsapp_status_callback_from_webhook_payload_parses_status():
    payload = {
        "entry": [
            {
                "id": "WABA_ID",
                "changes": [
                    {
                        "field": "messages",
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": "5215550000000",
                                "phone_number_id": "1234567890",
                            },
                            "statuses": [
                                {
                                    "id": "wamid.TEST",
                                    "status": "delivered",
                                    "timestamp": "1710000100",
                                    "recipient_id": "521234567890",
                                }
                            ],
                        },
                    }
                ],
            }
        ]
    }

    callbacks = MetaWhatsAppStatusCallback.from_webhook_payload(payload)

    assert len(callbacks) == 1
    callback = callbacks[0]
    assert callback.message_sid == "wamid.TEST"
    assert callback.status == "delivered"
    assert callback.phone_number_id == "1234567890"
    assert callback.timestamp == "1710000100"
