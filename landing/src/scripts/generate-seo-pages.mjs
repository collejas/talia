#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "..", "..");
const cssHref = (depth) => `${"../".repeat(depth)}assets/css/seo-pages.css?v=20260625a`;
const whatsappPhone = "5214443354450";

function whatsappHref(message) {
  return `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`;
}

const sectionGroups = {
  producto: {
    label: "Funciones",
    introTitle: "Qué incluye TalIA",
    introLead:
      "TalIA se entiende mejor por lo que aporta al flujo comercial: atención, CRM, seguimiento y conversión.",
    introMode: "cards",
    introItems: [
      ["Qué hace", "Explica el beneficio principal antes que el módulo.", "blue"],
      ["Componentes", "Conecta CRM, WhatsApp, prospección y seguimiento.", "violet"],
      ["Conversión", "Lleva al usuario hacia una demo o una página de precios.", "green"],
    ],
  },
  soluciones: {
    label: "Casos de uso",
    introTitle: "Qué problema resuelve cada caso de uso",
    introLead:
      "Cada página aterriza el beneficio: responder más rápido, automatizar seguimiento, agendar o cerrar más ventas.",
    introMode: "steps",
    introItems: [
      ["Detecta el problema", "Identifica qué parte del flujo se rompe hoy: respuesta lenta, seguimiento débil o falta de orden."],
      ["Activa el caso de uso", "La IA entra en el punto correcto: WhatsApp, ventas, automatización o agenda."],
      ["Entrega resultado", "El equipo trabaja con más contexto, menos fricción y mayor velocidad de cierre."],
    ],
  },
  prospeccion: {
    label: "Prospección",
    introTitle: "Qué aporta la prospección",
    introLead:
      "Estas soluciones cubren el trabajo previo a la venta: encontrar contactos, construir bases útiles y activar campañas que sí generan oportunidades.",
    introMode: "cards",
    introItems: [
      ["Fuentes", "Parte de búsquedas, directorios y contactos públicos con potencial comercial.", "blue"],
      ["Limpieza", "Convierte datos dispersos en listas que el equipo realmente pueda usar.", "violet"],
      ["Activación", "Lleva la base a campañas, WhatsApp o seguimiento comercial.", "green"],
    ],
  },
  industrias: {
    label: "Industrias",
    introTitle: "Cómo se adaptan las industrias",
    introLead:
      "Cada vertical traduce TalIA a un caso real: inmobiliarias, servicios, negocios locales, ventas B2B y turismo tienen recorridos y objeciones distintas.",
    introMode: "cards",
    introItems: [
      ["Contexto", "El mensaje usa el lenguaje y el proceso de cada industria.", "blue"],
      ["Caso de uso", "Se enfoca en citas, cotizaciones, reservas o seguimiento según el sector.", "violet"],
      ["Acción", "La página empuja al usuario hacia el flujo que más le conviene.", "green"],
    ],
  },
};

const sectionPages = {
  producto: [
    { href: "/que-es-talia", label: "Qué es TalIA" },
    { href: "/crm-con-ia-para-whatsapp", label: "CRM con IA para WhatsApp" },
    { href: "/asistente-ia-empresas", label: "Asistente IA para empresas" },
    { href: "/caracteristicas", label: "Características" },
  ],
  soluciones: [
    { href: "/ia-de-whatsapp", label: "IA de WhatsApp" },
    { href: "/ia-para-ventas", label: "IA para ventas" },
    { href: "/automatizacion-de-ventas", label: "Automatización de ventas" },
    { href: "/seguimiento-ventas", label: "Seguimiento de ventas" },
    { href: "/agenda-y-cotizaciones", label: "Agenda y cotizaciones" },
  ],
  prospeccion: [
    { href: "/prospeccion-comercial", label: "Prospección comercial" },
    { href: "/buscar-contactos", label: "Buscar contactos" },
    { href: "/prospectos-google-denue", label: "Prospectos Google y DENUE" },
    { href: "/campanas-marketing", label: "Campañas y marketing" },
  ],
  industrias: [
    { href: "/industrias", label: "Ver industrias" },
    { href: "/industrias/inmobiliarias", label: "Inmobiliarias" },
    { href: "/industrias/servicios", label: "Servicios" },
    { href: "/industrias/negocios-locales", label: "Negocios locales" },
    { href: "/industrias/ventas-b2b", label: "Ventas B2B" },
    { href: "/industrias/turismo", label: "Turismo" },
  ],
};

function getSectionKey(url) {
  if (url.startsWith("/industrias")) {
    return "industrias";
  }
  if (
    [
      "/ia-de-whatsapp",
      "/ia-para-ventas",
      "/automatizacion-de-ventas",
      "/seguimiento-ventas",
      "/agenda-y-cotizaciones",
    ].includes(url)
  ) {
    return "soluciones";
  }
  if (
    [
      "/prospeccion-comercial",
      "/buscar-contactos",
      "/prospectos-google-denue",
      "/campanas-marketing",
    ].includes(url)
  ) {
    return "prospeccion";
  }
  return "producto";
}

const navGroups = [
  {
    label: "Funciones",
    links: [
      { href: "/que-es-talia", label: "Qué es TalIA" },
      { href: "/crm-con-ia-para-whatsapp", label: "CRM con IA para WhatsApp" },
      { href: "/asistente-ia-empresas", label: "Asistente IA para empresas" },
      { href: "/caracteristicas", label: "Características" },
    ],
  },
  {
    label: "Casos de uso",
    links: [
      { href: "/ia-de-whatsapp", label: "IA de WhatsApp" },
      { href: "/ia-para-ventas", label: "IA para ventas" },
      { href: "/automatizacion-de-ventas", label: "Automatización de ventas" },
      { href: "/seguimiento-ventas", label: "Seguimiento de ventas" },
      { href: "/agenda-y-cotizaciones", label: "Agenda y cotizaciones" },
    ],
  },
  {
    label: "Prospección",
    links: [
      { href: "/prospeccion-comercial", label: "Prospección comercial" },
      { href: "/buscar-contactos", label: "Buscar contactos" },
      { href: "/prospectos-google-denue", label: "Prospectos Google y DENUE" },
      { href: "/campanas-marketing", label: "Campañas y marketing" },
    ],
  },
  {
    label: "Industrias",
    links: sectionPages.industrias,
  },
];

const pages = [
  {
    output: "que-es-talia.html",
    url: "/que-es-talia",
    title: "Qué es TalIA | CRM con IA para WhatsApp y ventas",
    description: "Qué es TalIA y cómo ayuda a convertir prospectos en ventas con CRM con IA, IA de WhatsApp y automatización comercial.",
    eyebrow: "Producto",
    headline: "Qué es TalIA",
    lede: "TalIA es una plataforma comercial que une prospección, WhatsApp, CRM y automatización para responder más rápido y dar seguimiento real.",
    primaryCta: { label: "Quiero una demo", href: "https://wa.me/5214443354450?text=Hola,%20quiero%20saber%20qué%20es%20Tal-IA%20y%20ver%20una%20demo" },
    secondaryCta: { label: "Ver CRM con IA", href: "/crm-con-ia-para-whatsapp" },
    stats: [
      ["1 plataforma", "para prospectos, conversaciones y seguimiento."],
      ["24/7", "respuesta automática por WhatsApp."],
      ["+ orden", "pipeline y tareas en un solo lugar."],
    ],
    sectionTitle: "Qué resuelve",
    sectionLead: "TalIA convierte la operación comercial en un flujo claro para responder, calificar, organizar y avanzar oportunidades hacia cita o cierre.",
    navWhatsAppLabel: "Hablar por WhatsApp",
    navWhatsAppText: "Hola, quiero conocer TalIA y ver una demo.",
    cards: [
      ["CRM con IA", "Centraliza leads y conversaciones con contexto comercial.", "blue"],
      ["IA para ventas", "Acelera la respuesta y reduce el tiempo perdido en seguimiento manual.", "violet"],
      ["Prospección con IA", "Encuentra clientes potenciales y crea una base accionable.", "green"],
    ],
    bodySections: [
      {
        title: "Qué es TalIA en la práctica",
        lead: "TalIA se entiende mejor como una operación comercial completa: responde, ordena y convierte.",
        mode: "cards",
        items: [
          ["Responder", "Atiende el primer contacto sin perder velocidad.", "blue"],
          ["Ordenar", "Conecta chats, pipeline y seguimiento en una sola lógica.", "violet"],
          ["Convertir", "Lleva el interés hacia demo, cita o cotización.", "green"],
        ],
      },
      {
        title: "Dónde aporta más",
        lead: "El visitante puede identificar rápido si su operación necesita más orden, seguimiento y velocidad de respuesta.",
        mode: "steps",
        items: [
          ["Llegan prospectos", "La empresa recibe conversaciones y consultas todos los días."],
          ["Falta seguimiento", "Los leads se enfrían o se quedan en chats dispersos."],
          ["Se necesita control", "Dirección o ventas quiere ver el avance real."],
          ["Se busca convertir", "La operación necesita más cierres con menos fricción."],
        ],
      },
    ],
    related: [
      ["/crm-con-ia-para-whatsapp", "CRM con IA para WhatsApp"],
      ["/ia-de-whatsapp", "IA de WhatsApp"],
      ["/precios", "Precios"],
    ],
    faq: [
      ["¿TalIA es solo un chatbot?", "No. También ordena pipeline, seguimiento y derivación a asesores."],
      ["¿Sirve para ventas y soporte?", "Sí. El foco es comercial, pero puede apoyar atención y seguimiento operativo."],
    ],
  },
  {
    output: "crm-con-ia-para-whatsapp.html",
    url: "/crm-con-ia-para-whatsapp",
    title: "CRM con IA para WhatsApp | TalIA",
    description: "CRM con IA para WhatsApp que centraliza leads, conversaciones, seguimiento y agenda comercial.",
    eyebrow: "Producto",
    headline: "CRM con IA para WhatsApp",
    lede: "La categoría más fuerte de TalIA: un CRM que organiza conversaciones de WhatsApp, prioriza prospectos y mantiene trazabilidad comercial para que ventas no dependa de chats sueltos.",
    primaryCta: { label: "Ver demo", href: "https://wa.me/5214443354450?text=Hola,%20quiero%20ver%20el%20CRM%20con%20IA%20para%20WhatsApp%20de%20Tal-IA" },
    secondaryCta: { label: "Qué es TalIA", href: "/que-es-talia" },
    stats: [
      ["WhatsApp + CRM", "Conversaciones y pipeline en la misma vista."],
      ["Seguimiento", "Cada lead tiene siguiente acción y responsable."],
      ["Agenda", "Citas y cotizaciones con contexto."],
    ],
    sectionTitle: "Por qué importa",
    sectionLead: "Aquí se concentra la intención más comercial: CRM, IA, WhatsApp, ventas y seguimiento en una sola URL. El valor está en ordenar todo el proceso comercial.",
    navWhatsAppLabel: "Ver por WhatsApp",
    navWhatsAppText: "Hola, quiero ver el CRM con IA para WhatsApp de TalIA.",
    cards: [
      ["Centraliza leads", "No pierdas prospectos entre chats o notas sueltas.", "blue"],
      ["Ordena el pipeline", "Ver etapas, responsables y próximos pasos es clave para convertir.", "violet"],
      ["Automatiza seguimiento", "Recordatorios y respuestas automáticas sin perder contexto humano.", "green"],
    ],
    bodySections: [
      {
        title: "Qué incluye el CRM",
        lead: "El CRM con IA organiza conversaciones, pipeline y seguimiento en una sola operación.",
        mode: "cards",
        items: [
          ["Inbox comercial", "Todos los chats de WhatsApp organizados en un flujo de trabajo útil.", "blue"],
          ["Pipeline visual", "Cada oportunidad tiene etapa, responsable y siguiente acción.", "violet"],
          ["Seguimiento guiado", "Recordatorios y tareas para que el lead no se enfríe.", "green"],
        ],
      },
      {
        title: "Para quién es",
        lead: "Funciona mejor en equipos que responden prospectos, cotizan y dan seguimiento todos los días.",
        mode: "cards",
        items: [
          ["Ventas", "Equipos que miden velocidad de respuesta y cierre.", "blue"],
          ["Atención comercial", "Empresas que cotizan por WhatsApp todos los días.", "violet"],
          ["Dirección", "Quienes necesitan ver el estado real del pipeline.", "green"],
        ],
      },
      {
        title: "Cómo se implementa",
        lead: "La adopción se traduce en menos fricción y más control comercial desde el primer día.",
        mode: "steps",
        items: [
          ["Conecta WhatsApp", "Se integra el canal donde realmente entran los prospectos."],
          ["Define pipeline", "Se ajustan etapas, responsables y prioridades."],
          ["Activa seguimiento", "Se automatizan recordatorios y tareas clave."],
          ["Mide resultados", "Ventas ve respuesta, avance y cierre con más claridad."],
        ],
      },
    ],
    related: [
      ["/ia-de-whatsapp", "IA de WhatsApp"],
      ["/ia-para-ventas", "IA para ventas"],
      ["/seguimiento-ventas", "Seguimiento de ventas"],
    ],
    faq: [
      ["¿Sirve para WhatsApp Business?", "Sí. La propuesta es ordenar la atención y el seguimiento comercial desde WhatsApp."],
      ["¿Esta es la página más importante?", "Sí. Es la que une la categoría completa y debe empujar demo."],
    ],
  },
  {
    output: "asistente-ia-empresas.html",
    url: "/asistente-ia-empresas",
    title: "Asistente IA para empresas | TalIA",
    description: "Asistente IA para empresas que atiende conversaciones, pregunta, registra datos y conecta prospectos con tu CRM.",
    eyebrow: "Producto",
    headline: "Asistente IA para empresas",
    lede: "Un asistente comercial que responde rápido, recopila datos, califica interés y deja al equipo entrar solo cuando hay una oportunidad real.",
    primaryCta: { label: "Pedir demo", href: "https://wa.me/5214443354450?text=Hola,%20quiero%20ver%20el%20asistente%20IA%20para%20empresas%20de%20Tal-IA" },
    secondaryCta: { label: "Ver características", href: "/caracteristicas" },
    stats: [
      ["Asistencia", "Respuestas y preguntas guiadas por IA."],
      ["Calificación", "Filtra prospectos y detecta intención."],
      ["Conexión", "Entrega oportunidades listas al CRM."],
    ],
    sectionTitle: "Qué hace",
    sectionLead: "El asistente reduce trabajo repetitivo y mejora la velocidad de atención sin quitar control al equipo.",
    navWhatsAppLabel: "Pedir demo",
    navWhatsAppText: "Hola, quiero ver el asistente IA para empresas de TalIA.",
    cards: [
      ["Atiende", "Da respuesta inmediata y mantiene viva la conversación.", "blue"],
      ["Registra", "Guarda datos clave para el equipo comercial.", "violet"],
      ["Deriva", "Pasa el caso al asesor cuando hay intención real.", "green"],
    ],
    bodySections: [
      {
        title: "Qué hace el asistente",
        lead: "El asistente tiene un rol claro: atender, registrar y pasar solo los casos con valor comercial.",
        mode: "cards",
        items: [
          ["Recibir", "Responde el mensaje inicial sin demoras.", "blue"],
          ["Preguntar", "Obtiene datos útiles para calificar mejor.", "violet"],
          ["Pasar", "Entrega el caso al equipo solo cuando hay valor comercial.", "green"],
        ],
      },
      {
        title: "Cuándo conviene usarlo",
        lead: "Aporta más cuando hay volumen, poca disponibilidad o necesidad de separar curiosos de prospectos reales.",
        mode: "steps",
        items: [
          ["Mucho volumen", "Cuando entran muchas conversaciones y hace falta ordenar."],
          ["Poca disponibilidad", "Cuando el equipo no puede responder siempre al instante."],
          ["Proceso comercial", "Cuando hace falta separar curiosos de prospectos reales."],
        ],
      },
    ],
    related: [
      ["/crm-con-ia-para-whatsapp", "CRM con IA para WhatsApp"],
      ["/ia-de-whatsapp", "IA de WhatsApp"],
      ["/que-es-talia", "Qué es TalIA"],
    ],
    faq: [
      ["¿Es un asistente genérico?", "No. Está enfocado en procesos comerciales y seguimiento."],
      ["¿Funciona para distintas industrias?", "Sí, se adapta a la operación de cada negocio."],
    ],
  },
  {
    output: "ia-de-whatsapp.html",
    url: "/ia-de-whatsapp",
    title: "IA de WhatsApp para empresas | TalIA",
    description: "IA de WhatsApp para responder, calificar y dar seguimiento comercial con CRM y automatización.",
    eyebrow: "Solución",
    headline: "IA de WhatsApp para responder, calificar y dar seguimiento",
    lede: "TalIA funciona como una IA para WhatsApp que atiende conversaciones, pide datos, responde dudas y conecta al prospecto con tu CRM para que cada chat tenga siguiente paso.",
    primaryCta: { label: "Ver demo de WhatsApp", href: "https://wa.me/5214443354450?text=Hola,%20quiero%20ver%20la%20IA%20de%20WhatsApp%20de%20Tal-IA" },
    secondaryCta: { label: "Ver CRM con IA", href: "/crm-con-ia-para-whatsapp" },
    stats: [
      ["< 2 s", "primera respuesta para evitar fugas."],
      ["24/7", "atención continua sin crecer nómina."],
      ["CRM", "cada chat se convierte en seguimiento."],
    ],
    sectionTitle: "Cómo se usa",
    sectionLead: "La IA de WhatsApp resuelve el inicio del flujo comercial: responder rápido, entender intención y llevar cada caso al siguiente paso.",
    navWhatsAppLabel: "Ver en WhatsApp",
    navWhatsAppText: "Hola, quiero ver la IA de WhatsApp de TalIA.",
    cards: [
      ["Responde", "Contesta preguntas frecuentes y da contexto comercial.", "blue"],
      ["Califica", "Pregunta lo necesario para saber si el lead vale tiempo humano.", "violet"],
      ["Agenda", "Lleva al prospecto a cita o cotización sin fricción.", "green"],
    ],
    bodySections: [
      {
        title: "Flujo de atención",
        lead: "El flujo va desde el primer mensaje hasta que el lead queda listo para un asesor.",
        mode: "steps",
        items: [
          ["Recibe", "Entra el mensaje y se abre la conversación con contexto.",],
          ["Pregunta", "La IA hace las preguntas mínimas para entender intención y necesidad."],
          ["Clasifica", "Determina si el caso va a ventas, soporte o seguimiento."],
          ["Entrega", "La oportunidad se manda al CRM o al asesor con toda la información."],
        ],
      },
      {
        title: "Cuándo conviene usarla",
        lead: "Sirve cuando el volumen de chats o la velocidad de respuesta ya afecta conversiones.",
        mode: "cards",
        items: [
          ["Leads entrantes", "Cuando llegan muchas consultas y hay riesgo de dejar prospectos en visto.", "blue"],
          ["Fuera de horario", "Cuando necesitas atender después de horas sin perder oportunidades.", "violet"],
          ["Precalificación", "Cuando quieres filtrar antes de pasar el lead a un asesor humano.", "green"],
        ],
      },
      {
        title: "Qué debe sentir el usuario",
        lead: "La IA resuelve el primer contacto sin perder claridad ni control comercial.",
        mode: "cards",
        items: [
          ["Rapidez", "El lead siente respuesta inmediata y no espera sin contexto.", "blue"],
          ["Orden", "La empresa sabe qué pasó en cada conversación.", "violet"],
          ["Control", "El equipo decide cuándo entra una persona y cuándo no.", "green"],
        ],
      },
    ],
    related: [
      ["/ia-para-ventas", "IA para ventas"],
      ["/seguimiento-ventas", "Seguimiento de ventas"],
      ["/automatizacion-de-ventas", "Automatización de ventas"],
    ],
    faq: [
      ["¿Es IA para WhatsApp o IA de WhatsApp?", "Las dos búsquedas apuntan al mismo concepto; esta página ataca ambas."],
      ["¿Sirve para equipos comerciales?", "Sí. Está pensada para ventas y seguimiento."],
    ],
  },
  {
    output: "ia-para-ventas.html",
    url: "/ia-para-ventas",
    title: "IA para ventas | TalIA",
    description: "IA para ventas que ayuda a responder leads, calificar oportunidades y acelerar cierres con seguimiento automatizado.",
    eyebrow: "Solución",
    headline: "IA para ventas que convierte conversaciones en cierres",
    lede: "TalIA ayuda a equipos comerciales a responder primero, priorizar prospectos y mover cada oportunidad sin perder velocidad. La intención aquí es dejar claro que no se trata de un chatbot, sino de una capa comercial que ordena el trabajo diario.",
    primaryCta: { label: "Quiero ver IA para ventas", href: "https://wa.me/5214443354450?text=Hola,%20quiero%20ver%20la%20IA%20para%20ventas%20de%20Tal-IA" },
    secondaryCta: { label: "Ver seguimiento", href: "/seguimiento-ventas" },
    stats: [
      ["Prioridad", "ordena leads por intención y urgencia."],
      ["Rapidez", "menos tiempo entre mensaje y respuesta."],
      ["Cierre", "más oportunidades llegan a asesor humano."],
    ],
    sectionTitle: "Enfoque",
    sectionLead: "La IA para ventas quita tareas repetitivas y da mejor contexto para cerrar con más productividad y control del pipeline.",
    navWhatsAppLabel: "Quiero verlo",
    navWhatsAppText: "Hola, quiero ver la IA para ventas de TalIA.",
    cards: [
      ["Prioriza", "Detecta qué prospectos merecen atención primero.", "blue"],
      ["Acompaña", "No deja caer leads por falta de seguimiento.", "violet"],
      ["Estandariza", "Hace consistente la operación del equipo comercial.", "green"],
    ],
    bodySections: [
      {
        title: "Qué mejora en ventas",
        lead: "El impacto se ve en orden, velocidad de respuesta y más posibilidades de cierre.",
        mode: "cards",
        items: [
          ["Orden", "Saber qué lead va primero y por qué.", "blue"],
          ["Velocidad", "Reducir el tiempo entre llegada del lead y primera respuesta.", "violet"],
          ["Conversión", "Aumentar la probabilidad de cierre con mejor contexto.", "green"],
        ],
      },
      {
        title: "Flujo comercial recomendado",
        lead: "La secuencia muestra el uso real del producto dentro del proceso comercial.",
        mode: "steps",
        items: [
          ["Entra el lead", "El prospecto llega por WhatsApp, formulario o campaña."],
          ["Se califica", "La IA pregunta lo necesario y detecta intención."],
          ["Se prioriza", "El equipo ve qué oportunidades requieren atención inmediata."],
          ["Se cierra", "El asesor entra con mejor contexto y menos pérdida de tiempo."],
        ],
      },
    ],
    related: [
      ["/ia-de-whatsapp", "IA de WhatsApp"],
      ["/automatizacion-de-ventas", "Automatización de ventas"],
      ["/seguimiento-ventas", "Seguimiento de ventas"],
    ],
    faq: [
      ["¿La IA para ventas es solo automatización?", "No. Combina automatización, priorización y contexto."],
      ["¿Sirve para empresas con asesorías humanas?", "Sí. El humano entra cuando el lead ya está filtrado."],
    ],
  },
  {
    output: "automatizacion-de-ventas.html",
    url: "/automatizacion-de-ventas",
    title: "Automatización de ventas | TalIA",
    description: "Automatización de ventas para responder leads, mover pipeline y reducir trabajo manual en procesos comerciales.",
    eyebrow: "Solución",
    headline: "Automatización de ventas para trabajar menos y vender mejor",
    lede: "Automatiza respuesta, registro, asignación y seguimiento para que el equipo comercial dedique tiempo a cerrar, no a repetir tareas.",
    primaryCta: { label: "Solicitar demo", href: "https://wa.me/5214443354450?text=Hola,%20quiero%20ver%20la%20automatizaci%C3%B3n%20de%20ventas%20de%20Tal-IA" },
    secondaryCta: { label: "Ver agenda y cotizaciones", href: "/agenda-y-cotizaciones" },
    stats: [
      ["Menos manualidad", "menos tareas repetitivas del equipo."],
      ["Más trazabilidad", "cada paso queda registrado."],
      ["Más velocidad", "flujo comercial más rápido y claro."],
    ],
    sectionTitle: "Qué automatiza",
    sectionLead: "Se automatiza lo que consume tiempo y no aporta valor directo a la venta.",
    navWhatsAppLabel: "Solicitar demo",
    navWhatsAppText: "Hola, quiero ver la automatización de ventas de TalIA.",
    cards: [
      ["Captura", "Toma el lead y lo registra sin fricción.", "blue"],
      ["Movimiento", "Asigna etapas y responsables.", "violet"],
      ["Seguimiento", "Mantiene vivo el flujo hasta el cierre.", "green"],
    ],
    bodySections: [
      {
        title: "Qué automatiza",
        lead: "El flujo deja de ser manual en captura, asignación, recordatorio y seguimiento.",
        mode: "cards",
        items: [
          ["Captura", "Registra leads sin pasos extra.", "blue"],
          ["Asignación", "Distribuye oportunidades a la persona correcta.", "violet"],
          ["Recordatorio", "Mantiene el seguimiento activo sin depender de memoria humana.", "green"],
        ],
      },
      {
        title: "Cuándo conviene usarla",
        lead: "Sirve cuando el equipo ya siente el costo de repetir tareas y perseguir leads manualmente.",
        mode: "steps",
        items: [
          ["Muchos leads", "Cuando la entrada de prospectos supera la capacidad manual."],
          ["Trabajo repetitivo", "Cuando el equipo pierde tiempo copiando, asignando o avisando."],
          ["Seguimiento disperso", "Cuando el pipeline se enfría por falta de procesos."],
        ],
      },
    ],
    related: [
      ["/seguimiento-ventas", "Seguimiento de ventas"],
      ["/ia-para-ventas", "IA para ventas"],
      ["/agenda-y-cotizaciones", "Agenda y cotizaciones"],
    ],
    faq: [
      ["¿Esto reemplaza al CRM?", "No. Lo potencia con automatización y reglas comerciales."],
      ["¿Puedo empezar por una parte?", "Sí. El flujo puede crecer por fases."],
    ],
  },
  {
    output: "seguimiento-ventas.html",
    url: "/seguimiento-ventas",
    title: "Seguimiento de ventas | TalIA",
    description: "Seguimiento de ventas automatizado para no dejar prospectos en visto y mantener cada oportunidad activa.",
    eyebrow: "Solución",
    headline: "Seguimiento de ventas para no perder oportunidades",
    lede: "El seguimiento correcto convierte conversaciones en cierres. TalIA mantiene recordatorios, estado y contexto para que nada se enfríe.",
    primaryCta: { label: "Ver seguimiento", href: "https://wa.me/5214443354450?text=Hola,%20quiero%20ver%20el%20seguimiento%20de%20ventas%20de%20Tal-IA" },
    secondaryCta: { label: "Ver automatización", href: "/automatizacion-de-ventas" },
    stats: [
      ["Recordatorios", "mensajes y tareas sin olvidos."],
      ["Contexto", "cada lead conserva historial."],
      ["Conversión", "menos fugas por falta de seguimiento."],
    ],
    sectionTitle: "Por qué importa",
    sectionLead: "En ventas, la velocidad de seguimiento define buena parte del resultado. Este flujo ayuda a sostener oportunidades con claridad.",
    navWhatsAppLabel: "Ver seguimiento",
    navWhatsAppText: "Hola, quiero ver el seguimiento de ventas de TalIA.",
    cards: [
      ["Persistencia", "Mantén la conversación sin perseguir manualmente.", "blue"],
      ["Orden", "Sabes qué toca hacer con cada oportunidad.", "violet"],
      ["Visibilidad", "Ve el estado real del pipeline.", "green"],
    ],
    bodySections: [
      {
        title: "Qué resuelve el seguimiento",
        lead: "Responder no basta: hay que sostener el proceso hasta que el lead avance o se descarte con criterio.",
        mode: "cards",
        items: [
          ["Leads fríos", "Recupera prospectos que se quedaron sin respuesta.", "blue"],
          ["Pendientes", "Evita que tareas y recordatorios se pierdan.", "violet"],
          ["Pipeline visible", "Permite ver en qué etapa está cada oportunidad.", "green"],
        ],
      },
      {
        title: "Cómo se trabaja",
        lead: "El mecanismo evita fugas de seguimiento y mantiene viva la oportunidad.",
        mode: "steps",
        items: [
          ["Detectar", "Identificar oportunidades que necesitan nuevo contacto."],
          ["Programar", "Definir cuándo y cómo volver a escribir o llamar."],
          ["Actualizar", "Registrar avance, respuesta o bloqueo del lead."],
          ["Cerrar", "Mantener vivo el caso hasta convertirlo o descartarlo."],
        ],
      },
    ],
    related: [
      ["/ia-para-ventas", "IA para ventas"],
      ["/automatizacion-de-ventas", "Automatización de ventas"],
      ["/crm-con-ia-para-whatsapp", "CRM con IA para WhatsApp"],
    ],
    faq: [
      ["¿Sirve para leads fríos?", "Sí. Justo ayuda a reactivarlos con seguimiento constante."],
      ["¿Se puede asignar a asesores?", "Sí. El flujo puede enrutar oportunidades según reglas."],
    ],
  },
  {
    output: "agenda-y-cotizaciones.html",
    url: "/agenda-y-cotizaciones",
    title: "Agenda y cotizaciones | TalIA",
    description: "Agenda y cotizaciones por WhatsApp con IA para convertir interés en citas y propuestas concretas.",
    eyebrow: "Solución",
    headline: "Agenda y cotizaciones sin fricción",
    lede: "TalIA acelera el paso entre interés y acción: agenda citas, comparte cotizaciones y da seguimiento al prospecto correcto.",
    primaryCta: { label: "Ver agenda", href: "https://wa.me/5214443354450?text=Hola,%20quiero%20ver%20agenda%20y%20cotizaciones%20de%20Tal-IA" },
    secondaryCta: { label: "Ver IA de WhatsApp", href: "/ia-de-whatsapp" },
    stats: [
      ["Citas", "agenda más rápido desde WhatsApp."],
      ["Cotizaciones", "envío estructurado y rastreable."],
      ["Seguimiento", "cada propuesta sigue viva."],
    ],
    sectionTitle: "Objetivo",
    sectionLead: "El objetivo es convertir intención en acción con menos ida y vuelta y más citas o propuestas claras.",
    navWhatsAppLabel: "Ver agenda",
    navWhatsAppText: "Hola, quiero ver agenda y cotizaciones de TalIA.",
    cards: [
      ["Agenda", "Reduce fricción para coordinar citas.", "blue"],
      ["Cotiza", "Envía propuestas con contexto comercial.", "violet"],
      ["Confirma", "Asegura asistencia y continuidad.", "green"],
    ],
    bodySections: [
      {
        title: "Qué pasa entre interés y cita",
        lead: "Aquí se resuelve el tramo donde muchas ventas se pierden: después del primer interés.",
        mode: "steps",
        items: [
          ["Recibe interés", "El lead pregunta, pide precio o muestra intención de agendar."],
          ["Se califica", "La IA obtiene datos para dar una respuesta útil."],
          ["Se agenda o cotiza", "Se avanza a cita o propuesta sin retrasos innecesarios."],
          ["Se confirma", "El flujo mantiene la continuidad hasta la acción real."],
        ],
      },
      {
        title: "Casos donde aporta más",
        lead: "La solución aporta más cuando el siguiente paso es agendar, cotizar o confirmar interés.",
        mode: "cards",
        items: [
          ["Servicios consultivos", "Cuando necesitas cotizar antes de cerrar.", "blue"],
          ["Agendas comerciales", "Cuando el paso siguiente es una cita.", "violet"],
          ["Seguimiento postinterés", "Cuando el prospecto no debe enfriarse.", "green"],
        ],
      },
    ],
    related: [
      ["/ia-de-whatsapp", "IA de WhatsApp"],
      ["/seguimiento-ventas", "Seguimiento de ventas"],
      ["/crm-con-ia-para-whatsapp", "CRM con IA para WhatsApp"],
    ],
    faq: [
      ["¿Funciona con WhatsApp?", "Sí. La experiencia está pensada para ese canal."],
      ["¿Sirve para ventas consultivas?", "Sí. Ayuda a pasar de interés a cita o cotización."],
    ],
  },
  {
    output: "prospeccion-comercial.html",
    url: "/prospeccion-comercial",
    title: "Prospección comercial | TalIA",
    description: "Prospección comercial con IA para encontrar clientes, crear listas accionables y activar campañas útiles.",
    eyebrow: "Prospección",
    headline: "Prospección comercial con IA",
    lede: "TalIA te ayuda a salir a buscar clientes, no solo a atenderlos. La prospección se vuelve un proceso trazable y más rápido, con bases útiles y un mejor punto de partida para ventas.",
    primaryCta: { label: "Quiero prospectar", href: "https://wa.me/5214443354450?text=Hola,%20quiero%20ver%20la%20prospecci%C3%B3n%20comercial%20de%20Tal-IA" },
    secondaryCta: { label: "Buscar contactos", href: "/buscar-contactos" },
    stats: [
      ["Más alcance", "prospecta con mejor foco."],
      ["Mejor base", "contactos útiles y listos para trabajar."],
      ["Menos tiempo", "menos horas de búsqueda manual."],
    ],
    sectionTitle: "Flujo",
    sectionLead: "La prospección comercial termina en una lista accionable, no en datos sueltos. Aquí se muestra el paso previo a WhatsApp y a ventas.",
    navWhatsAppLabel: "Quiero prospectar",
    navWhatsAppText: "Hola, quiero ver la prospección comercial de TalIA.",
    cards: [
      ["Encuentra", "Localiza prospectos con criterio comercial.", "blue"],
      ["Filtra", "Separa lo útil de lo irrelevante.", "violet"],
      ["Activa", "Convierte la lista en campañas y seguimiento.", "green"],
    ],
    bodySections: [
      {
        title: "Qué hace la prospección",
        lead: "Prospectar es construir una base que sí pueda convertirse en venta.",
        mode: "cards",
        items: [
          ["Buscar", "Encontrar empresas o contactos con intención comercial.", "blue"],
          ["Depurar", "Quitar ruido y quedarte con oportunidades reales.", "violet"],
          ["Activar", "Pasar la lista a campañas, WhatsApp o seguimiento.", "green"],
        ],
      },
      {
        title: "Resultado esperado",
        lead: "El objetivo no es solo encontrar datos: es dejar al equipo con una base lista para trabajar.",
        mode: "steps",
        items: [
          ["Definir objetivo", "Saber qué tipo de cliente necesitas encontrar."],
          ["Construir lista", "Crear una base enfocada y accionable."],
          ["Pasar a ventas", "Entregar contactos listos para el siguiente flujo."],
        ],
      },
    ],
    related: [
      ["/buscar-contactos", "Buscar contactos"],
      ["/prospectos-google-denue", "Prospectos Google y DENUE"],
      ["/campanas-marketing", "Campañas y marketing"],
    ],
    faq: [
      ["¿Prospección es lo mismo que marketing?", "No. Prospectar es ir a buscar oportunidades; marketing las activa y nutre."],
      ["¿Se usa antes de WhatsApp?", "Sí. Es el inicio del ciclo comercial."],
    ],
  },
  {
    output: "buscar-contactos.html",
    url: "/buscar-contactos",
    title: "Buscar contactos para ventas | TalIA",
    description: "Buscar contactos para ventas con IA, listas útiles y prospectos listos para trabajar.",
    eyebrow: "Prospección",
    headline: "Buscar contactos para ventas",
    lede: "TalIA convierte búsquedas dispersas en contactos útiles para el equipo comercial. Menos ruido, más prospectos accionables.",
    primaryCta: { label: "Ver búsqueda", href: "https://wa.me/5214443354450?text=Hola,%20quiero%20buscar%20contactos%20para%20ventas%20con%20Tal-IA" },
    secondaryCta: { label: "Prospección comercial", href: "/prospeccion-comercial" },
    stats: [
      ["Contactos útiles", "no solo listas, sino prospectos reales."],
      ["Rapidez", "menos tiempo buscando y limpiando datos."],
      ["Contexto", "cada contacto nace listo para el flujo."],
    ],
    sectionTitle: "Cómo ayuda",
    sectionLead: "La búsqueda de contactos debe terminar en una base que ventas pueda usar sin fricción.",
    navWhatsAppLabel: "Buscar contactos",
    navWhatsAppText: "Hola, quiero buscar contactos para ventas con TalIA.",
    cards: [
      ["Localiza", "Encuentra empresas y personas de interés.", "blue"],
      ["Depura", "Evita bases infladas y poco útiles.", "violet"],
      ["Entrega", "Pasa contactos listos al flujo de seguimiento.", "green"],
    ],
    bodySections: [
      {
        title: "Qué aporta buscar contactos",
        lead: "La base resultante debe servir de inmediato para ventas.",
        mode: "cards",
        items: [
          ["Foco", "Busca solo lo que tenga sentido comercial.", "blue"],
          ["Orden", "Evita listas largas que no se pueden trabajar.", "violet"],
          ["Velocidad", "Entrega contactos listos para el siguiente paso.", "green"],
        ],
      },
      {
        title: "Cómo se utiliza",
        lead: "El tránsito ideal va de búsqueda a activación comercial sin pasos innecesarios.",
        mode: "steps",
        items: [
          ["Definir criterio", "Elegir el tipo de contacto o empresa que sí vale la pena."],
          ["Encontrar", "Localizar contactos con señales de interés o encaje."],
          ["Limpiar", "Eliminar ruido antes de pasar la base al equipo."],
          ["Activar", "Mover la lista a seguimiento, WhatsApp o campañas."],
        ],
      },
    ],
    related: [
      ["/prospectos-google-denue", "Prospectos Google y DENUE"],
      ["/prospeccion-comercial", "Prospección comercial"],
      ["/campanas-marketing", "Campañas y marketing"],
    ],
    faq: [
      ["¿Sirve para ventas B2B?", "Sí. Es ideal para bases y prospección comercial."],
      ["¿Puedo usarlo para otros canales?", "Sí. El contacto se puede activar por email, WhatsApp o voz."],
    ],
  },
  {
    output: "prospectos-google-denue.html",
    url: "/prospectos-google-denue",
    title: "Prospectos en Google y DENUE | TalIA",
    description: "Prospectos en Google y DENUE para crear listas comerciales desde fuentes públicas y útiles para ventas.",
    eyebrow: "Prospección",
    headline: "Prospectos en Google y DENUE",
    lede: "TalIA convierte búsquedas en listas de prospectos con intención comercial para que tu equipo deje de empezar desde cero.",
    primaryCta: { label: "Ver prospectos", href: "https://wa.me/5214443354450?text=Hola,%20quiero%20ver%20prospectos%20en%20Google%20y%20DENUE%20con%20Tal-IA" },
    secondaryCta: { label: "Buscar contactos", href: "/buscar-contactos" },
    stats: [
      ["Fuentes públicas", "Google y DENUE como punto de partida."],
      ["Base útil", "menos datos vacíos y más enfoque."],
      ["Ventas", "listas para activar seguimiento."],
    ],
    sectionTitle: "Enfoque",
    sectionLead: "La intención aquí es convertir búsquedas de prospectos por fuente en oportunidad real.",
    navWhatsAppLabel: "Ver prospectos",
    navWhatsAppText: "Hola, quiero ver prospectos en Google y DENUE con TalIA.",
    cards: [
      ["Google", "Extrae oportunidades de búsquedas y directorios.", "blue"],
      ["DENUE", "Aprovecha datos empresariales públicos.", "violet"],
      ["Activación", "Lleva esa base al flujo comercial.", "green"],
    ],
    bodySections: [
      {
        title: "Por qué importa esta fuente",
        lead: "Google y DENUE permiten empezar con señales públicas y llevarlas a una base comercial.",
        mode: "cards",
        items: [
          ["Google", "Descubre empresas visibles en búsquedas y directorios.", "blue"],
          ["DENUE", "Aprovecha información empresarial pública.", "violet"],
          ["Base real", "Convierte esas fuentes en una lista trabajable.", "green"],
        ],
      },
      {
        title: "Qué problema resuelve",
        lead: "Usar estas fuentes ahorra tiempo frente a empezar desde cero.",
        mode: "steps",
        items: [
          ["Evitar arranque en cero", "No empezar cada búsqueda manualmente."],
          ["Tener contexto", "Saber quién puede tener valor comercial."],
          ["Pasar a ventas", "Convertir las fuentes públicas en acción comercial."],
        ],
      },
    ],
    related: [
      ["/prospeccion-comercial", "Prospección comercial"],
      ["/buscar-contactos", "Buscar contactos"],
      ["/campanas-marketing", "Campañas y marketing"],
    ],
    faq: [
      ["¿Esto reemplaza la prospección manual?", "La reduce de forma importante, pero sigue requiriendo criterio comercial."],
      ["¿Genera listas limpias?", "Sí, ese es el objetivo principal."],
    ],
  },
  {
    output: "campanas-marketing.html",
    url: "/campanas-marketing",
    title: "Campañas y marketing con IA | TalIA",
    description: "Campañas y marketing con IA para activar prospectos, medir respuestas y reactivar leads fríos.",
    eyebrow: "Prospección",
    headline: "Campañas y marketing con IA",
    lede: "Activa mensajes y seguimiento sin perder el hilo comercial. La IA ayuda a sostener campañas más consistentes y medibles.",
    primaryCta: { label: "Ver campañas", href: "https://wa.me/5214443354450?text=Hola,%20quiero%20ver%20campa%C3%B1as%20y%20marketing%20con%20Tal-IA" },
    secondaryCta: { label: "Reactivar prospectos", href: "/seguimiento-ventas" },
    stats: [
      ["Tracking", "métricas claras por campaña."],
      ["Automatización", "menos tareas repetitivas."],
      ["Reactivación", "reactiva prospectos fríos."],
    ],
    sectionTitle: "Qué aporta",
    sectionLead: "Marketing comercial es saber a quién activar, cuándo hacerlo y cómo medir la respuesta.",
    navWhatsAppLabel: "Ver campañas",
    navWhatsAppText: "Hola, quiero ver campañas y marketing con TalIA.",
    cards: [
      ["Campañas", "Diseña activaciones con propósito.", "blue"],
      ["Medición", "Mide aperturas, respuestas y avance.", "violet"],
      ["Reactivación", "Recupera leads que se enfriaron.", "green"],
    ],
    bodySections: [
      {
        title: "Qué hace una campaña útil",
        lead: "Una campaña útil tiene objetivo, seguimiento y aprendizaje.",
        mode: "cards",
        items: [
          ["Activa", "Pone en movimiento bases que estaban quietas.", "blue"],
          ["Mide", "Registra respuesta y avance para aprender.", "violet"],
          ["Recupera", "Sirve para reactivar leads fríos o dormidos.", "green"],
        ],
      },
      {
        title: "Cuándo usar campañas",
        lead: "Esto sirve para trabajar bases con intención, no para spam.",
        mode: "steps",
        items: [
          ["Base lista", "Ya tienes contactos o prospectos definidos."],
          ["Objetivo claro", "Quieres agendar, cotizar o reactivar."],
          ["Seguimiento", "Necesitas saber qué pasó después del envío."],
          ["Aprendizaje", "Quieres ajustar mensajes y flujo según respuesta."],
        ],
      },
    ],
    related: [
      ["/prospeccion-comercial", "Prospección comercial"],
      ["/buscar-contactos", "Buscar contactos"],
      ["/seguimiento-ventas", "Seguimiento de ventas"],
    ],
    faq: [
      ["¿Solo funciona con WhatsApp?", "No. Puede apoyar email y otros canales de seguimiento."],
      ["¿Es marketing masivo?", "No. Es marketing comercial con foco en conversión."],
    ],
  },
  {
    output: "industrias/index.html",
    url: "/industrias",
    title: "Industrias | TalIA",
    description: "Soluciones TalIA por industria: inmobiliarias, servicios, negocios locales, ventas B2B y turismo.",
    eyebrow: "Industrias",
    headline: "TalIA por industria",
    lede: "Cada vertical tiene reglas distintas. Esta página agrupa los casos de uso que más sentido comercial tienen para TalIA.",
    primaryCta: { label: "Ver inmobiliarias", href: "/industrias/inmobiliarias" },
    secondaryCta: { label: "Volver al inicio", href: "/" },
    stats: [
      ["Verticales", "casos con intención específica."],
      ["Adaptación", "lenguaje y flujo por sector."],
      ["Conversión", "contenido más cercano al usuario."],
    ],
    sectionTitle: "Casos de uso",
    sectionLead: "La sección industrias agrupa los sectores donde TalIA aporta más valor comercial.",
    navWhatsAppLabel: "Ver industria",
    navWhatsAppText: "Hola, quiero ver las industrias de TalIA.",
    cards: [
      ["Inmobiliarias", "Leads, citas y seguimiento comercial.", "blue"],
      ["Servicios", "Cotizaciones y atención rápida.", "violet"],
      ["Ventas B2B", "Prospección y seguimiento estructurado.", "green"],
    ],
    bodySections: [
      {
        title: "Qué aporta esta sección",
        lead: "Agrupa las verticales y muestra dónde TalIA encaja mejor según el negocio.",
        mode: "cards",
        items: [
          ["Descubrir", "Ver qué industrias tienen una propuesta específica.", "blue"],
          ["Elegir", "Ir al caso de uso más cercano a tu operación.", "violet"],
          ["Avanzar", "Pasar a demo o a la página que mejor encaja.", "green"],
        ],
      },
      {
        title: "Qué cambia por industria",
        lead: "Cada sector usa lenguaje y flujo distintos, pero el objetivo sigue siendo responder mejor y convertir más.",
        mode: "steps",
        items: [
          ["Detectar el caso", "Elegir la vertical que más se parece al negocio."],
          ["Ver el flujo", "Entender qué problema resuelve TalIA en ese sector."],
          ["Abrir la página", "Ir a la vista específica de la industria."],
        ],
      },
    ],
    related: [
      ["/industrias/inmobiliarias", "IA para inmobiliarias"],
      ["/industrias/servicios", "IA para servicios"],
      ["/industrias/negocios-locales", "IA para negocios locales"],
      ["/industrias/ventas-b2b", "IA para ventas B2B"],
      ["/industrias/turismo", "IA para turismo"],
      ["/ia-de-whatsapp", "IA de WhatsApp"],
      ["/crm-con-ia-para-whatsapp", "CRM con IA para WhatsApp"],
    ],
    faq: [
      ["¿Habrá más industrias?", "Sí. Esta página está pensada para crecer por fases."],
      ["¿Qué industria debe ir primero?", "Inmobiliarias, por potencial y diferenciación."],
    ],
  },
  {
    output: "industrias/inmobiliarias.html",
    url: "/industrias/inmobiliarias",
    title: "IA para inmobiliarias | TalIA",
    description: "IA para inmobiliarias por WhatsApp que responde leads, perfila compradores y agenda citas automáticamente.",
    eyebrow: "Industrias",
    headline: "IA para inmobiliarias por WhatsApp",
    lede: "TalIA responde leads inmobiliarios en segundos, pregunta lo necesario y agenda citas sin depender del seguimiento manual.",
    primaryCta: { label: "Ver demo inmobiliaria", href: "https://wa.me/5214443354450?text=Hola,%20quiero%20ver%20la%20IA%20para%20inmobiliarias%20de%20Tal-IA" },
    secondaryCta: { label: "Ver industrias", href: "/industrias" },
    stats: [
      ["Responde", "sin dejar leads en visto."],
      ["Perfila", "zona, presupuesto y etapa."],
      ["Agenda", "citas y visitas automáticas."],
    ],
    sectionTitle: "En inmobiliarias",
    sectionLead: "La intención es mostrar un flujo claro de respuesta, calificación y cita para inmobiliarias.",
    navWhatsAppLabel: "Ver inmobiliaria",
    navWhatsAppText: "Hola, quiero ver la IA para inmobiliarias de TalIA.",
    cards: [
      ["Leads", "Responde prospectos que llegan por campañas o portales.", "blue"],
      ["Citas", "Reduce el tiempo entre interés y visita.", "violet"],
      ["Seguimiento", "No pierdas compradores por falta de respuesta.", "green"],
    ],
    bodySections: [
      {
        title: "Casos de uso inmobiliarios",
        lead: "No todos los leads llegan igual; aquí se ve dónde aporta más la automatización.",
        mode: "cards",
        items: [
          ["Portales", "Respuestas rápidas para leads que llegan desde portales inmobiliarios.", "blue"],
          ["Visitas", "Agenda recorridos y confirma asistencia sin fricción.", "violet"],
          ["Seguimiento", "Mantén vivos prospectos que todavía están comparando opciones.", "green"],
        ],
      },
      {
        title: "Qué busca el usuario",
        lead: "La intención real es agendar más rápido, calificar mejor y perder menos interesados.",
        mode: "steps",
        items: [
          ["Respuesta rápida", "El prospecto recibe atención antes de irse con otro asesor."],
          ["Calificación", "Se capturan datos clave como zona, presupuesto y tipo de propiedad."],
          ["Cita", "El lead pasa a una visita o conversación con más contexto."],
        ],
      },
    ],
    related: [
      ["/ia-de-whatsapp", "IA de WhatsApp"],
      ["/crm-con-ia-para-whatsapp", "CRM con IA para WhatsApp"],
      ["/seguimiento-ventas", "Seguimiento de ventas"],
    ],
    faq: [
      ["¿Sirve para desarrollos inmobiliarios?", "Sí. Puede adaptarse a proyectos, inventario y visita."],
      ["¿Reemplaza al asesor?", "No. Lo ayuda a llegar con leads mejor calificados."],
    ],
  },
  {
    output: "industrias/servicios.html",
    url: "/industrias/servicios",
    title: "IA para servicios | TalIA",
    description: "IA para servicios que ayuda a cotizar, agendar, responder WhatsApp y dar seguimiento a solicitudes.",
    eyebrow: "Industrias",
    headline: "IA para servicios",
    lede: "TalIA ayuda a negocios de servicios a responder rápido, cotizar con contexto y mantener orden en las solicitudes entrantes.",
    primaryCta: { label: "Ver demo de servicios", href: "https://wa.me/5214443354450?text=Hola,%20quiero%20ver%20IA%20para%20servicios%20con%20Tal-IA" },
    secondaryCta: { label: "Ver industrias", href: "/industrias" },
    stats: [
      ["Cotiza", "respuestas más claras y rápidas."],
      ["Agenda", "citas y confirmaciones automáticas."],
      ["Ordena", "seguimiento por solicitud."],
    ],
    sectionTitle: "En servicios",
    sectionLead: "Los servicios necesitan rapidez, cotización clara y seguimiento.",
    navWhatsAppLabel: "Ver servicios",
    navWhatsAppText: "Hola, quiero ver IA para servicios con TalIA.",
    cards: [
      ["Cotizaciones", "Respuestas más precisas y sin demora.", "blue"],
      ["Agenda", "Reduce fricción al coordinar citas.", "violet"],
      ["Seguimiento", "No dejes caer solicitudes por falta de respuesta.", "green"],
    ],
    related: [
      ["/agenda-y-cotizaciones", "Agenda y cotizaciones"],
      ["/ia-de-whatsapp", "IA de WhatsApp"],
      ["/seguimiento-ventas", "Seguimiento de ventas"],
    ],
    faq: [
      ["¿Sirve para servicios profesionales?", "Sí. Es útil para empresas que cotizan y agendan."],
      ["¿Puede adaptarse por tipo de servicio?", "Sí. El flujo puede ajustarse al proceso real."],
    ],
  },
  {
    output: "industrias/negocios-locales.html",
    url: "/industrias/negocios-locales",
    title: "IA para negocios locales | TalIA",
    description: "IA para negocios locales que responde por WhatsApp, organiza leads y ayuda a vender más sin perder seguimiento.",
    eyebrow: "Industrias",
    headline: "IA para negocios locales",
    lede: "TalIA ayuda a pequeños negocios y comercios locales a responder mejor, atender más rápido y cerrar más oportunidades.",
    primaryCta: { label: "Ver demo local", href: "https://wa.me/5214443354450?text=Hola,%20quiero%20ver%20IA%20para%20negocios%20locales%20con%20Tal-IA" },
    secondaryCta: { label: "Ver industrias", href: "/industrias" },
    stats: [
      ["Atención", "rápida y constante por WhatsApp."],
      ["Ventas", "menos leads perdidos."],
      ["Orden", "seguimiento simple y claro."],
    ],
    sectionTitle: "En negocios locales",
    sectionLead: "La intención es dar una opción clara para comercios que necesitan responder rápido y vender sin estructura pesada.",
    navWhatsAppLabel: "Ver local",
    navWhatsAppText: "Hola, quiero ver IA para negocios locales con TalIA.",
    cards: [
      ["WhatsApp", "Atiende el canal más usado por el cliente.", "blue"],
      ["Seguimiento", "No dejes preguntas sin respuesta.", "violet"],
      ["Conversión", "Convierte interés en visitas o ventas.", "green"],
    ],
    related: [
      ["/ia-de-whatsapp", "IA de WhatsApp"],
      ["/seguimiento-ventas", "Seguimiento de ventas"],
      ["/automatizacion-de-ventas", "Automatización de ventas"],
    ],
    faq: [
      ["¿Sirve para comercios pequeños?", "Sí. Está pensada para equipos pequeños y ágiles."],
      ["¿Necesita mucha configuración?", "No necesariamente; puede arrancar simple."],
    ],
  },
  {
    output: "industrias/ventas-b2b.html",
    url: "/industrias/ventas-b2b",
    title: "IA para ventas B2B | TalIA",
    description: "IA para ventas B2B que ayuda a prospectar, calificar leads y dar seguimiento comercial estructurado.",
    eyebrow: "Industrias",
    headline: "IA para ventas B2B",
    lede: "TalIA ayuda a equipos B2B a prospectar con más orden, atender mejor y seguir oportunidades con contexto comercial.",
    primaryCta: { label: "Ver demo B2B", href: "https://wa.me/5214443354450?text=Hola,%20quiero%20ver%20IA%20para%20ventas%20B2B%20con%20Tal-IA" },
    secondaryCta: { label: "Ver prospección", href: "/prospeccion-comercial" },
    stats: [
      ["Prospección", "listas útiles y accionables."],
      ["Seguimiento", "control del ciclo largo de venta."],
      ["Cierre", "mejor contexto para el equipo."],
    ],
    sectionTitle: "En B2B",
    sectionLead: "La venta consultiva necesita seguimiento y contexto.",
    navWhatsAppLabel: "Ver B2B",
    navWhatsAppText: "Hola, quiero ver IA para ventas B2B con TalIA.",
    cards: [
      ["Prospección", "Busca cuentas y contactos con enfoque comercial.", "blue"],
      ["Pipeline", "Mantén el ciclo de venta visible.", "violet"],
      ["Seguimiento", "No pierdas tracción en ciclos largos.", "green"],
    ],
    related: [
      ["/prospeccion-comercial", "Prospección comercial"],
      ["/buscar-contactos", "Buscar contactos"],
      ["/seguimiento-ventas", "Seguimiento de ventas"],
    ],
    faq: [
      ["¿Sirve para ciclos de venta largos?", "Sí. B2B es justo donde más valor tiene el seguimiento."],
      ["¿Puedo activar campañas?","Sí. Puede apoyarse con prospección y campañas."],
    ],
  },
  {
    output: "industrias/turismo.html",
    url: "/industrias/turismo",
    title: "IA para turismo | TalIA",
    description: "IA para turismo que responde consultas, cotiza reservas y ayuda a agendar sin perder seguimiento.",
    eyebrow: "Industrias",
    headline: "IA para turismo",
    lede: "TalIA ayuda a empresas de turismo y reservas a responder rápido, cotizar mejor y dar seguimiento a cada viaje o solicitud.",
    primaryCta: { label: "Ver demo turismo", href: "https://wa.me/5214443354450?text=Hola,%20quiero%20ver%20IA%20para%20turismo%20con%20Tal-IA" },
    secondaryCta: { label: "Ver industrias", href: "/industrias" },
    stats: [
      ["Reservas", "respuestas ágiles y claras."],
      ["Cotización", "mejor tiempo de respuesta."],
      ["Seguimiento", "menos abandono de consulta."],
    ],
    sectionTitle: "En turismo",
    sectionLead: "Turismo necesita disponibilidad, rapidez y claridad en la cotización.",
    navWhatsAppLabel: "Ver turismo",
    navWhatsAppText: "Hola, quiero ver IA para turismo con TalIA.",
    cards: [
      ["Reservas", "Responde disponibilidad y proceso.", "blue"],
      ["Cotizaciones", "Agiliza precios y opciones.", "violet"],
      ["Seguimiento", "Mantén viva la intención de compra.", "green"],
    ],
    related: [
      ["/agenda-y-cotizaciones", "Agenda y cotizaciones"],
      ["/ia-de-whatsapp", "IA de WhatsApp"],
      ["/seguimiento-ventas", "Seguimiento de ventas"],
    ],
    faq: [
      ["¿Sirve para agencias de viajes?", "Sí. Es una de las verticales más naturales para este flujo."],
      ["¿Puedo personalizar el mensaje?", "Sí. El flujo se adapta a la operación."],
    ],
  },
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderNav(page, depth = 0) {
  const prefix = "../".repeat(depth);
  const homeHref = depth ? `${prefix}` : "/";
  const pricesHref = depth ? `${prefix}precios` : "/precios";
  const demoHref = depth ? `${prefix}demo.html` : "/demo.html";
  const navWhatsAppLabel = page.navWhatsAppLabel || "Agenda una demo";
  const navWhatsAppText = page.navWhatsAppText || "Hola, quiero una demo de TalIA.";
  return `
  <header class="site-header">
    <div class="site-header__inner">
      <a class="brand" href="${homeHref}" aria-label="TalIA">
        <img src="${prefix}Logo8.svg" alt="" aria-hidden="true" />
        <span>Tal-IA</span>
      </a>
      <nav class="nav" aria-label="Navegación principal">
        <a class="nav__link" href="${homeHref}">Inicio</a>
        ${navGroups
          .map(
            (group) => `
        <details class="nav__group">
          <summary class="nav__button">${escapeHtml(group.label)}</summary>
          <div class="dropdown">
            ${group.links
              .map((link) => `<a href="${link.href}">${escapeHtml(link.label)}</a>`)
              .join("\n")}
          </div>
        </details>`
          )
          .join("\n")}
        <a class="nav__link" href="${pricesHref}">Precios</a>
        <a class="nav__cta nav__cta--secondary" href="${demoHref}">Agendar demo</a>
        <a class="nav__cta" href="${whatsappHref(navWhatsAppText)}" target="_blank" rel="noopener noreferrer">${escapeHtml(navWhatsAppLabel)}</a>
      </nav>
      <details class="nav-mobile-menu">
        <summary aria-label="Abrir menú">Menú</summary>
        <div class="nav-mobile-menu__panel">
          <a href="${homeHref}">Inicio</a>
          ${navGroups
            .map(
              (group) => `
          <div class="nav-mobile-menu__group">
            <div class="nav-mobile-menu__label">${escapeHtml(group.label)}</div>
            ${group.links.map((link) => `<a href="${link.href}">${escapeHtml(link.label)}</a>`).join("\n")}
          </div>`
            )
            .join("\n")}
          <a href="${pricesHref}">Precios</a>
          <div class="nav-mobile-menu__actions">
            <a class="nav__cta nav__cta--secondary" href="${demoHref}">Agendar demo</a>
            <a class="nav__cta" href="${whatsappHref(navWhatsAppText)}" target="_blank" rel="noopener noreferrer">${escapeHtml(navWhatsAppLabel)}</a>
          </div>
        </div>
      </details>
    </div>
  </header>`;
}

function renderPage(page) {
  const depth = page.url.split("/").filter(Boolean).length - 1;
  const prefix = "../".repeat(depth);
  const sectionKey = getSectionKey(page.url);
  const sectionGroup = sectionGroups[sectionKey];
  const siblingLinks = sectionPages[sectionKey]
    .filter((link) => link.href !== page.url)
    .map(
      (link) =>
        `<a class="link-card" href="${link.href}"><strong>${escapeHtml(link.label)}</strong><span>Más páginas de ${escapeHtml(sectionGroup.label)}.</span></a>`
    )
    .join("\n");
  const relatedLinks = page.related
    .map(([href, label]) => `<a class="link-card" href="${href}"><strong>${escapeHtml(label)}</strong><span>Ver esta solución relacionada.</span></a>`)
    .join("\n");

  const cards = page.cards
    .map(([title, copy, color]) => `
      <article class="feature-card">
        <div class="eyebrow" style="border-color: rgba(37,99,235,.16); color: var(--${color}); background: rgba(37,99,235,.05);">${escapeHtml(page.eyebrow)}</div>
        <h3 style="margin: 12px 0 0; font-size: 18px;">${escapeHtml(title)}</h3>
        <p>${escapeHtml(copy)}</p>
      </article>`)
    .join("\n");

  const stats = page.stats
    .map(([title, copy]) => `<div class="stat"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(copy)}</span></div>`)
    .join("\n");

  const faq = page.faq
    .map(([q, a]) => `<details class="feature-card"><summary style="cursor:pointer;font-weight:850;">${escapeHtml(q)}</summary><p>${escapeHtml(a)}</p></details>`)
    .join("\n");

  const extraSections = (page.bodySections || [])
    .map((block) => {
      const blockContent =
        block.mode === "steps"
          ? `<div class="process-grid">
              ${block.items
                .map(
                  ([title, copy], index) => `
              <article class="step-card">
                <div class="step-card__index">0${index + 1}</div>
                <h3>${escapeHtml(title)}</h3>
                <p>${escapeHtml(copy)}</p>
              </article>`
                )
                .join("\n")}
            </div>`
          : `<div class="feature-grid">
              ${block.items
                .map(
                  ([title, copy, color]) => `
              <article class="feature-card">
                <div class="eyebrow" style="border-color: rgba(37,99,235,.16); color: var(--${color}); background: rgba(37,99,235,.05);">${escapeHtml(sectionGroup.label)}</div>
                <h3 style="margin: 12px 0 0; font-size: 18px;">${escapeHtml(title)}</h3>
                <p>${escapeHtml(copy)}</p>
              </article>`
                )
                .join("\n")}
            </div>`;

      return `
    <section class="section">
      <div class="section__head">
        <div>
          <h2>${escapeHtml(block.title)}</h2>
          <p>${escapeHtml(block.lead)}</p>
        </div>
      </div>
      ${blockContent}
    </section>`;
    })
    .join("\n");

  const groupIntro =
    sectionGroup.introMode === "steps"
      ? `
      <div class="process-grid">
        ${sectionGroup.introItems
          .map(
            ([title, copy], index) => `
        <article class="step-card">
          <div class="step-card__index">0${index + 1}</div>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(copy)}</p>
        </article>`
          )
          .join("\n")}
      </div>`
      : `
      <div class="feature-grid">
        ${sectionGroup.introItems
          .map(
            ([title, copy, color]) => `
        <article class="feature-card">
          <div class="eyebrow" style="border-color: rgba(37,99,235,.16); color: var(--${color}); background: rgba(37,99,235,.05);">${escapeHtml(sectionGroup.label)}</div>
          <h3 style="margin: 12px 0 0; font-size: 18px;">${escapeHtml(title)}</h3>
          <p>${escapeHtml(copy)}</p>
        </article>`
          )
          .join("\n")}
      </div>`;

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.description)}" />
  <link rel="canonical" href="https://talia.mx${page.url}" />
  <link rel="alternate" hreflang="es-MX" href="https://talia.mx${page.url}" />
  <link rel="alternate" hreflang="x-default" href="https://talia.mx/" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="es_MX" />
  <meta property="og:site_name" content="Talia" />
  <meta property="og:title" content="${escapeHtml(page.title)}" />
  <meta property="og:description" content="${escapeHtml(page.description)}" />
  <meta property="og:url" content="https://talia.mx${page.url}" />
  <meta property="og:image" content="https://talia.mx/android-chrome-512x512.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(page.title)}" />
  <meta name="twitter:description" content="${escapeHtml(page.description)}" />
  <meta name="twitter:image" content="https://talia.mx/android-chrome-512x512.png" />
  <meta name="theme-color" content="#7f13ec" />
  <link rel="apple-touch-icon" href="${prefix}apple-touch-icon.png" />
  <link rel="stylesheet" href="${cssHref(depth)}" />
</head>
<body>
  <main class="page">
    ${renderNav(page, depth)}

    <section class="hero">
      <div class="hero__copy">
        <div class="eyebrow">${escapeHtml(page.eyebrow)}</div>
        <h1>${escapeHtml(page.headline)}</h1>
        <p>${escapeHtml(page.lede)}</p>
        <div class="actions">
          <a class="button primary" href="${page.primaryCta.href}" target="_blank" rel="noopener noreferrer">${escapeHtml(page.primaryCta.label)}</a>
          <a class="button secondary" href="${page.secondaryCta.href}">${escapeHtml(page.secondaryCta.label)}</a>
        </div>
        <div class="stats">
          ${stats}
        </div>
      </div>

      <aside class="hero__panel">
        <div class="panel-grid">
          <div class="panel">
            <strong>${escapeHtml(page.sectionTitle)}</strong>
            <p style="margin: 8px 0 0; color: var(--muted); line-height: 1.5;">${escapeHtml(page.sectionLead)}</p>
          </div>
          ${cards}
        </div>
      </aside>
    </section>

    <section class="section">
      <div class="section__head">
        <div>
          <h2>${escapeHtml(sectionGroup.introTitle)}</h2>
          <p>${escapeHtml(sectionGroup.introLead)}</p>
        </div>
      </div>
      ${groupIntro}
    </section>

    <section class="section">
      <div class="section__head">
        <div>
          <h2>Sigue explorando</h2>
          <p>Encuentra otras páginas relacionadas que completan el mismo flujo comercial desde distintos ángulos.</p>
        </div>
      </div>
      <div class="section__subhead">Más páginas de ${escapeHtml(sectionGroup.label)}</div>
      <div class="links-grid">
        ${siblingLinks}
      </div>
      <div class="section__subhead" style="margin-top: 18px;">Relacionadas con esta ruta</div>
      <div class="links-grid">
        ${relatedLinks}
      </div>
    </section>

    ${extraSections}

    <section class="section">
      <div class="section__head">
        <div>
          <h2>Preguntas frecuentes</h2>
          <p>Respuestas breves para aclarar cómo funciona cada solución en la práctica.</p>
        </div>
      </div>
      <div class="panel-grid">
        ${faq}
      </div>
    </section>

    <section class="cta-band">
      <div class="eyebrow">Siguiente paso</div>
      <h2 style="margin: 14px 0 0; font-size: clamp(28px, 3.2vw, 42px); line-height: 1; font-weight: 950;">${escapeHtml(page.headline)}</h2>
      <p>Si esta solución encaja con tu operación, el siguiente paso es revisar demo, precios o la página relacionada que mejor te ayude a avanzar.</p>
      <div class="actions">
        <a class="button primary" href="${page.primaryCta.href}" target="_blank" rel="noopener noreferrer">${escapeHtml(page.primaryCta.label)}</a>
        <a class="button secondary" href="${page.url === '/industrias' ? '/industrias/inmobiliarias' : '/'}">Seguir navegando</a>
      </div>
      <div class="footer-links">
        <a href="/">Inicio</a>
        <a href="/precios">Precios</a>
        <a href="/caracteristicas">Características</a>
      </div>
    </section>

    <div class="footer">TalIA · CRM con IA, automatización comercial y seguimiento por WhatsApp.</div>
  </main>
  <script type="module" src="/assets/js/whatsapp-float.js?v=20260625a"></script>
</body>
</html>`;
}

for (const page of pages) {
  const outputPath = resolve(root, "src", page.output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderPage(page), "utf8");
}

console.log(`Generated ${pages.length} SEO pages.`);
