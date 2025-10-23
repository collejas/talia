# Canal Voz (Twilio Voice) · TalIA

## Objetivo
Atender llamadas telefónicas a través de Twilio, transcribirlas y responder con TalIA en tiempo real usando `<Connect><Stream>`.

## Componentes Twilio necesarios
1. **Número telefónico** habilitado para voz.
2. **Twilio Functions / Webhook** que apunte al backend:
   - Voice URL → `https://{dominio}/api/voice/inbound` (por definir).
   - Status callback → `https://{dominio}/api/voice/status`.
3. **TwiML App** configurada para llamadas salientes si se requiere.
4. **API Keys** (SID + Secret) con permisos de voz.

## Configuración en backend
- Variables `.env`:
  - `TALIA_TWILIO_ACCOUNT_SID`
  - `TALIA_TWILIO_AUTH_TOKEN`
  - `TALIA_TWIML_APP_SID`
  - `TALIA_VOICE_WEBHOOK_SECRET` (para validar firma propia si se usa).
- Rutas previstas en `app/channels/voice/`:
  - `POST /api/voice/inbound`: responde con TwiML que inicia `<Connect><Stream>`.
  - `WS /api/voice/stream`: (Fase 3) recibe audio en vivo.
  - `POST /api/voice/status`: ya registrada como placeholder.

## Flujo de llamada (alto nivel)
1. Twilio recibe llamada y envía webhook `inbound` → backend responde con TwiML:
   ```xml
   <Response>
     <Connect>
       <Stream url="wss://{dominio}/api/voice/stream" />
     </Connect>
   </Response>
   ```
2. El streaming se procesa en backend (ASR + LLM) y se devuelve audio sintetizado.
3. Status callback actualiza estado (`ringing`, `in-progress`, `completed`).

## Registro en base de datos
- Tabla `voice_calls`
  - `call_sid`
  - `from_number`
  - `to_number`
  - `status`
  - `started_at`, `ended_at`
- Tabla `voice_transcripts`
  - `id`
  - `call_sid`
  - `speaker` (`caller`, `assistant`)
  - `text`
  - `timestamp`
- Tabla `leads`
  - `id`
  - `call_sid`
  - `name`, `email`, `phone`
  - `source` (`"voice"`)

## Métricas y eventos
- `call_started`
- `call_completed`
- `transcript_segment`
- `lead_created`

## Consideraciones técnicas
- Uso de servicios de STT/TTS (OpenAI Realtime u otro) con baja latencia.
- Manejo de reconexiones del WebSocket.
- Encriptar grabaciones si se almacenan.
- Cumplimiento de normativa local (avisar que la llamada se procesa con IA).
