# VARIABLES EN: .env

## =========================
## Generales / Logs
## =========================
TALIA_ENVIRONMENT=development
TALIA_LOG_LEVEL=debug
TALIA_REQUEST_LOG_LEVEL=debug
TALIA_REQUEST_LOG_SKIP_PREFIXES=
TALIA_LOG_FILE_PATH=/var/www/talia/logs/api.log

## =========================
## OpenAI
## =========================
TALIA_OPENAI_API_KEY=sk-admin-xxxxxx
TALIA_OPENAI_PROJECT_ID=sk-proj--xxxxx

TALIA_OPENAI_WEBCHAT_ASSISTANT_ID=pmpt_xxxx
TALIA_OPENAI_PROMPT_WEBCHAT_VERSION=52

WHATSAPP_ASSISTANT_ID=pmpt_xxxxx
WHATSAPP_PROMPT_VERSION=9

## =========================
## OPENAI (Text + Realtime)
## =========================
OPENAI_API_KEY=xxxxxx
OPENAI_PROMPT_ID=
OPENAI_PROMPT_ID_INSIGHTS=
OPENAI_MODEL=gpt-4o
OPENAI_MAX_TOKENS=40
OPENAI_STT_MODEL=gpt-4o-mini-transcribe

## =========================
## OPENAI REALTIME
## =========================
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_REALTIME_VOICE=alloy

### Formatos de audio μ-law 8k (Twilio)
REALTIME_INPUT_FORMAT=g711_ulaw
REALTIME_OUTPUT_FORMAT=g711_ulaw

### Detección de turnos (VAD servidor)
REALTIME_VAD_THRESHOLD=0.55
REALTIME_TURN_SILENCE_MS=600
REALTIME_PREFIX_PADDING_MS=200
REALTIME_CREATE_RESPONSE=true
REALTIME_INTERRUPT_RESPONSE=false
REALTIME_MIN_COMMIT_MS=160

## =========================
## Barge-in (interrupción mientras habla el bot)
## =========================
BARGE_IN_ENABLED=true
BARGE_REQUIRE_AI_SPEAKING=true
BARGE_REQUIRE_VAD=true
BARGE_ENERGY_HIGH=150
BARGE_ENERGY_LOW=110
BARGE_MIN_SPEECH_MS=480
BARGE_IN_MIN_AI_MS=600
BARGE_IN_COOLDOWN_MS=1200

## =========================
## AUDIO / TTS (fuera de Realtime)
## =========================
TTS_VOICE_ES=shimmer

## =========================
## Twilio
## =========================

TWILIO_ACCOUNT_SID=xxxxxx
TWILIO_AUTH_TOKEN=xxxxxx
TWILIO_PHONE_NUMBER=+5214443354450
TWILIO_PHONE_NUMBER_SID=
TWILIO_VALIDATE_SIGNATURES=
TWILIO_VALIDATE_SIGNATURES=false

## =========================
## TWILIO VOICE / STREAM
## =========================
WEBHOOK_PATH=call-whisper
VOICE_FULL_DUPLEX=true
VOICE_STREAM_JWT_SECRET=
DEBUG_VOICE_VERBOSE=true
DEBUG_ENERGY_EVERY_N=20

## =========================
## Supabase / DB
## =========================
TALIA_SUPABASE_URL=https://qnimyamtczbbwmlrlejc.supabase.co
TALIA_SUPABASE_SERVICE_ROLE=xxxxxx
SUPABASE_ANON_KEY=xxxxxxxx
TALIA_SUPABASE_JWT_SECRET=
TALIA_SUPABASE_LEGACY_JWT_SECRET=
DATABASE_URL=postgresql://postgres:xxxxxxx@db.qnimyamtczbbwmlrlejc.supabase.co:5432/postgres?


## =========================
## Portal de clientes
## =========================
TALIA_CLIENTE_PORTAL_BASE_URL=
TALIA_PORTAL_CLIENTE_URL=

## =========================
## Geolocalización
## =========================
TALIA_GEOLOCATION_API_URL=
TALIA_GEOLOCATION_API_TOKEN=
TALIA_GEOLOCATION_CACHE_TTL_SECONDS=

## =========================
## Google Places
## =========================
GOOGLE_PLACES_API_KEY=
API_NEARBY_SEARCH="https://places.googleapis.com/v1/places:searchNearby"
GOOGLE_PLACES_NEARBY_URL=
GOOGLE_PLACES_TEXT_URL=
GOOGLE_PLACES_DETAILS_URL=
PLACES_FIELD_MASK=
PLACES_DETAILS_FIELD_MASK=
PLACES_LANGUAGE_CODE=es
PLACES_REGION_CODE=MX

## =========================
## GOOGLE OAUTH
## =========================
GOOGLE_CLIENT_ID=xxxxx
GOOGLE_CLIENT_SECRET=xxxxxxxxxx
GOOGLE_REDIRECT_URI=https://maria.geoactiv.mx/auth/google/callback

## =========================
## DENUE
## =========================
DENUE_TOKEN=
DENUE_BASE_URL=

## =========================
## Webchat / Calendario
## =========================
TALIA_WEBCHAT_INACTIVITY_HOURS=
TALIA_WEBCHAT_PERSIST_SESSION=
TALIA_WEBCHAT_CALENDAR_RESOURCE_ID=
TALIA_WEBCHAT_CALENDAR_TIMEZONE=
TALIA_WEBCHAT_CALENDAR_DEFAULT_DAYS=
TALIA_WEBCHAT_CALENDAR_HOLD_MINUTES=

TALIA_WEBCHAT_CALENDAR_RESOURCE_ID=xxxx
TALIA_WEBCHAT_CALENDAR_TIMEZONE=America/Mexico_City
TALIA_WEBCHAT_CALENDAR_DEFAULT_DAYS=21
TALIA_WEBCHAT_CALENDAR_HOLD_MINUTES=10

TALIA_CALENDARIO_DEFAULT_PROVIDER=caldav
TALIA_CALENDARIO_USERNAME=hola@talia.mx
TALIA_CALENDARIO_PASSWORD=xxxxx
TALIA_CALENDARIO_SERVER_URL=https://mail.talia.mx:2080
TALIA_CALENDARIO_SERVER_PORT=2080
TALIA_CALENDARIO_SERVER_URL_ALTERNATE=https://mail.talia.mx:2080/principals/hola@talia.mx
TALIA_CALENDARIO_FULL_CALENDAR_URL=https://mail.talia.mx:2080/calendars/hola@talia.mx/calendar
TALIA_CALENDARIO_FULL_CONTACT_LIST_URL=https://mail.talia.mx:2080/addressbooks/hola@talia.mx/addressbook 

## =========================
## WhatsApp
## =========================
TALIA_WHATSAPP_INACTIVITY_HOURS=
WHATSAPP_INACTIVITY_HOURS=
TALIA_WHATSAPP_PROMPT_ID=
WHATSAPP_PROMPT_ID=
TALIA_WHATSAPP_PROMPT_VERSION=
WHATSAPP_PROMPT_VERSION=
TALIA_WHATSAPP_ASSISTANT_ID=
WHATSAPP_ASSISTANT_ID=

## =========================
## Correo
## =========================
TALIA_MAIL_USERNAME=hola@talia.mx
TALIA_MAIL_CONTRASENA=xxxxx
TALIA_MAIL_INCOMING_SERVER=mail.talia.mx
TALIA_MAIL_INCOMING_PORT_IMAP=993
TALIA_MAIL_OUTGOING_SERVER=mail.talia.mx 
TALIA_MAIL_OUTGOING_PORT_SMTP=465
TALIA_MAIL_USE_SSL=true
TALIA_MAIL_USE_TLS=false



# VARIABLES EN: .env.local

## =========================
## Backend del panel
## =========================
PANEL_API_URL=http://127.0.0.1:8004/api
# NEXT_PUBLIC_PANEL_API_URL=https://talia.mx/api

## =========================
## Organización / Usuario por defecto
## =========================
TALIA_ORGANIZACION_ID=
NEXT_PUBLIC_ORGANIZACION_ID=00000000-0000-0000-0000-000000000001
NEXT_PUBLIC_USUARIO_ID=

## =========================
## Origen cliente
## =========================
NEXT_PUBLIC_PANEL_ORIGIN=xxxxxx

## =========================
## Supabase (client y service)
## =========================
NEXT_PUBLIC_SUPABASE_URL=https://qnimyamtczbbwmlrlejc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxxxx
SUPABASE_SERVICE_ROLE=xxxxxx

## =========================
## Otros
## =========================
NODE_ENV=