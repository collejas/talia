TALIA_ENVIRONMENT=development
TALIA_LOG_LEVEL=debug
TALIA_REQUEST_LOG_LEVEL=debug

NEXT_PUBLIC_PANEL_API_URL=https://talia.mx/api
NEXT_PUBLIC_ORGANIZACION_ID=00000000-0000-0000-0000-000000000001
# NEXT_PUBLIC_USUARIO_ID=xxxxxx

PANEL_API_URL=http://127.0.0.1:8004/api


# =========================
# OPENAI #
# =========================
TALIA_OPENAI_API_KEY=xxxxx
TALIA_OPENAI_ASSISTANT_ID=pmpt_69001211f6688194b2e27f3cf50e959f08c8cd898208331e
TALIA_OPENAI_PROMPT_VERSION=52
TALIA_OPENAI_PROJECT_ID=xxxxx

# =========================
# OPENAI (Text + Realtime)
# =========================
OPENAI_API_KEY=
OPENAI_PROMPT_ID=
OPENAI_PROMPT_ID_INSIGHTS=
OPENAI_MODEL=gpt-4o
OPENAI_MAX_TOKENS=40
OPENAI_STT_MODEL=gpt-4o-mini-transcribe

# =========================
# OPENAI REALTIME
# =========================
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_REALTIME_VOICE=alloy

# Formatos de audio μ-law 8k (Twilio)
REALTIME_INPUT_FORMAT=g711_ulaw
REALTIME_OUTPUT_FORMAT=g711_ulaw

# Detección de turnos (VAD servidor)
REALTIME_VAD_THRESHOLD=0.55
REALTIME_TURN_SILENCE_MS=600
REALTIME_PREFIX_PADDING_MS=200
REALTIME_CREATE_RESPONSE=true
REALTIME_INTERRUPT_RESPONSE=false
REALTIME_MIN_COMMIT_MS=160

# =========================
# Barge-in (interrupción mientras habla el bot)
# =========================
BARGE_IN_ENABLED=true
BARGE_REQUIRE_AI_SPEAKING=true
BARGE_REQUIRE_VAD=true
BARGE_ENERGY_HIGH=150
BARGE_ENERGY_LOW=110
BARGE_MIN_SPEECH_MS=480
BARGE_IN_MIN_AI_MS=600
BARGE_IN_COOLDOWN_MS=1200

# =========================
# AUDIO / TTS (fuera de Realtime)
# =========================
TTS_VOICE_ES=shimmer


# =========================
# Twilio
# =========================
TWILIO_ACCOUNT_SID=xxxxx
TWILIO_AUTH_TOKEN=xxxxxxx
TWILIO_PHONE_NUMBER=+14422818909
TWILIO_PHONE_NUMBER_SID=PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_VALIDATE_SIGNATURES=false
# =========================
# TWILIO VOICE / STREAM
# =========================
WEBHOOK_PATH=call-whisper
VOICE_FULL_DUPLEX=true
VOICE_STREAM_JWT_SECRET=

DEBUG_VOICE_VERBOSE=true
DEBUG_ENERGY_EVERY_N=20


# SUPABASE #
SUPABASE_URL=https://qnimyamtczbbwmlrlejc.supabase.co
TALIA_SUPABASE_DATABASE_URL=postgresql://postgres:xxxxxx@db.qnimyamtczbbwmlrlejc.supabase.co:5432/postgres?sslmode=require
SUPABASE_SERVICE_ROLE=xxxxx
SUPABASE_ANON_KEY=xxxx
TALIA_SUPABASE_LEGACY_JWT_SECRET=xxxxxx
TALIA_SUPABASE_ACCES_TOKEN=xxxxx
DATABASE_URL=postgresql://postgres:xxxxxxx@db.qnimyamtczbbwmlrlejc.supabase.co:5432/postgres?sslmode=require
SUPABASE_DB_PASSWORD=xxxxxx
TALIA_WEBCHAT_INACTIVITY_HOURS=2
TALIA_WEBCHAT_PERSIST_SESSION=false

# CORREO #
TALIA_MAIL_USERNAME=hola@talia.mx
TALIA_MAIL_CONTRASENA=xxxxx
TALIA_MAIL_INCOMING_SERVER=mail.talia.mx
TALIA_MAIL_INCOMING_PORT_IMAP=993
TALIA_MAIL_OUTGOING_SERVER=mail.talia.mx 
TALIA_MAIL_OUTGOING_PORT_SMTP=465
TALIA_MAIL_USE_SSL=true
TALIA_MAIL_USE_TLS=false

# CALENDARIO #
TALIA_CALENDARIO_DEFAULT_PROVIDER=caldav
TALIA_CALENDARIO_USERNAME=hola@talia.mx
TALIA_CALENDARIO_PASSWORD=xxxxx
TALIA_CALENDARIO_SERVER_URL=https://mail.talia.mx:2080
TALIA_CALENDARIO_SERVER_PORT=2080
TALIA_CALENDARIO_SERVER_URL_ALTERNATE=https://mail.talia.mx:2080/principals/hola@talia.mx
TALIA_CALENDARIO_FULL_CALENDAR_URL=https://mail.talia.mx:2080/calendars/hola@talia.mx/calendar
TALIA_CALENDARIO_FULL_CONTACT_LIST_URL=https://mail.talia.mx:2080/addressbooks/hola@talia.mx/addressbook    

# CALENDARIO WEBCHAT #
TALIA_WEBCHAT_CALENDAR_RESOURCE_ID=e4ee6bea-b6ff-4b65-b40c-26781d4c4bac
TALIA_WEBCHAT_CALENDAR_TIMEZONE=America/Mexico_City
TALIA_WEBCHAT_CALENDAR_DEFAULT_DAYS=21
TALIA_WEBCHAT_CALENDAR_HOLD_MINUTES=10

# =========================
# GOOGLE OAUTH
# =========================
GOOGLE_CLIENT_ID=551023546216-sm8hcporfdk1upstdhdu1tci8fcjt5va.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxxxxxxx
GOOGLE_REDIRECT_URI=https://maria.geoactiv.mx/auth/google/callback
API_NEARBY_SEARCH="https://places.googleapis.com/v1/places:searchNearby"
GOOGLE_PLACES_API_KEY=xxxxx
PLACES_LANGUAGE_CODE=es
PLACES_REGION_CODE=MX

# =========================
# DENUE
# =========================
DENUE_TOKEN=xxxx
