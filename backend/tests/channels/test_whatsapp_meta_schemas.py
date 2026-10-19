from app.channels.whatsapp.schemas import (
    MetaWhatsAppIncomingMessage,
    MetaWhatsAppStatusCallback,
    MetaWhatsAppTemplateStatusUpdate,
)


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


def test_meta_whatsapp_status_callback_preserves_error_description():
    payload = {
        "entry": [{
            "changes": [{
                "value": {
                    "metadata": {"phone_number_id": "1234567890"},
                    "statuses": [{
                        "id": "wamid.FAILED",
                        "status": "failed",
                        "errors": [{
                            "code": 131026,
                            "title": "Message undeliverable",
                            "message": "Message undeliverable",
                            "error_data": {"details": "Recipient is not a WhatsApp user"},
                        }],
                    }],
                }
            }]
        }]
    }

    callback = MetaWhatsAppStatusCallback.from_webhook_payload(payload)[0]

    assert callback.error_code == "131026"
    assert callback.error_title == "Message undeliverable"
    assert callback.error_message == "Message undeliverable"
    assert callback.error_details == "Recipient is not a WhatsApp user"


def test_meta_whatsapp_status_callback_reads_value_errors():
    payload = {
        "entry": [{
            "changes": [{
                "value": {
                    "errors": [{
                        "code": 131049,
                        "message": "(#131049) Message not delivered",
                        "error_data": {"details": "This message was not delivered to maintain healthy ecosystem engagement."},
                    }],
                    "statuses": [{"id": "wamid.FAILED", "status": "failed"}],
                }
            }]
        }]
    }

    callback = MetaWhatsAppStatusCallback.from_webhook_payload(payload)[0]

    assert callback.error_code == "131049"
    assert callback.error_message == "(#131049) Message not delivered"
    assert callback.error_details == "This message was not delivered to maintain healthy ecosystem engagement."


def test_meta_whatsapp_template_status_update_parses_waba_event():
    payload = {
        "entry": [{
            "id": "WABA_ID",
            "changes": [{
                "field": "message_template_status_update",
                "value": {
                    "event": "REJECTED",
                    "message_template_id": "META_TEMPLATE_ID",
                    "message_template_name": "seguimiento_demo",
                    "message_template_language": "es_MX",
                    "reason": "INVALID_FORMAT",
                },
            }],
        }]
    }

    updates = MetaWhatsAppTemplateStatusUpdate.from_webhook_payload(payload)

    assert len(updates) == 1
    update = updates[0]
    assert update.waba_id == "WABA_ID"
    assert update.meta_template_id == "META_TEMPLATE_ID"
    assert update.template_name == "seguimiento_demo"
    assert update.language_code == "es_MX"
    assert update.status == "rejected"
    assert update.reason == "INVALID_FORMAT"
