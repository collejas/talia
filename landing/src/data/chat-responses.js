export const TALIA_INTRO = 'Hola, soy TalIA. Puedo ayudarte a automatizar procesos legales, financieros y operativos con información segura y auditable.';

export const chatResponses = [
  {
    keywords: ['contrato', 'contratos', 'legal'],
    message:
      'Analizo contratos en minutos: extraigo cláusulas sensibles, comparo versiones y genero minutas con pendientes claros.'
  },
  {
    keywords: ['integracion', 'integración', 'api', 'slack', 'drive', 'crm'],
    message:
      'Me conecto con Slack, Google Drive, CRMs y APIs internas para trabajar con tu información en contexto.'
  },
  {
    keywords: ['dato', 'datos', 'privacidad', 'seguridad', 'cumplimiento'],
    message:
      'Tus datos permanecen aislados por cliente, cifrados y con registro completo de auditoría. Cumplo con políticas empresariales y normativas locales.'
  },
  {
    keywords: ['limit', 'límite', 'limitación', 'alcance', 'no puedes'],
    message:
      'No reemplazo el criterio humano ni firmo decisiones. Soy un copiloto que recomienda, documenta y acelera el análisis manteniendo la decisión en tus manos.'
  },
  {
    keywords: ['precio', 'costo', 'plan', 'planes', 'licencia'],
    message:
      'Ofrezco planes Starter, Business y Enterprise. Podemos adaptar capacidades y niveles de soporte según tus necesidades.'
  },
  {
    keywords: ['idioma', 'ingles', 'inglés', 'español'],
    message: 'Trabajo de forma nativa en español y puedo operar en inglés cuando lo necesites.'
  },
  {
    keywords: ['implement', 'tiempo', 'onboarding', 'probar'],
    message:
      'El onboarding estándar toma entre 2 y 4 semanas. Iniciamos con un discovery, conectamos tus fuentes y configuramos flujos prioritarios.'
  }
];

export const fallbackMessage =
  'Puedo asistirte con análisis documental, generación de reportes y automatización de procesos. Pregunta por integraciones, seguridad o casos de uso específicos.';
