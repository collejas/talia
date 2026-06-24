#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(process.cwd(), "..");
const cssHref = (depth) => `${"../".repeat(depth)}assets/css/seo-pages.css?v=20260624c`;

const sectionGroups = {
  producto: {
    label: "Producto",
    introTitle: "Cómo leer Producto",
    introLead:
      "Estas páginas explican qué es TalIA, qué incluye la plataforma y cómo se presenta la propuesta antes de llevar al usuario a demo o precios.",
    introMode: "cards",
    introItems: [
      ["Qué es", "Define la propuesta completa y no solo una función aislada.", "blue"],
      ["Componentes", "Conecta CRM, WhatsApp, asistente y características.", "violet"],
      ["Conversión", "Lleva al usuario hacia una demo o una página de precios.", "green"],
    ],
  },
  soluciones: {
    label: "Soluciones",
    introTitle: "Qué resuelve cada solución",
    introLead:
      "Aquí se explica el problema operativo que TalIA resuelve, cómo entra en el flujo comercial y qué mejora para ventas o atención.",
    introMode: "steps",
    introItems: [
      ["Detecta el problema", "Identifica qué parte del flujo se rompe hoy: respuesta lenta, seguimiento débil o falta de orden."],
      ["Activa la solución", "La IA entra en el punto correcto: WhatsApp, ventas, automatización o agenda."],
      ["Entrega resultado", "El equipo trabaja con más contexto, menos fricción y mayor velocidad de cierre."],
    ],
  },
  prospeccion: {
    label: "Prospección",
    introTitle: "Cómo se entiende la prospección",
    introLead:
      "Estas páginas cubren el trabajo previo a la venta: encontrar contactos, construir bases útiles y activar campañas que sí mueven oportunidades.",
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
    label: "Producto",
    links: [
      { href: "/que-es-talia", label: "Qué es TalIA" },
      { href: "/crm-con-ia-para-whatsapp", label: "CRM con IA para WhatsApp" },
      { href: "/asistente-ia-empresas", label: "Asistente IA para empresas" },
      { href: "/caracteristicas", label: "Características" },
    ],
  },
  {
    label: "Soluciones",
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
    sectionLead: "TalIA no intenta ser un producto genérico. Su enfoque es comercial: responder, calificar, organizar y empujar oportunidades hacia una cita o cierre.",
    cards: [
      ["CRM con IA", "Centraliza leads y conversaciones con contexto comercial.", "blue"],
      ["IA para ventas", "Acelera la respuesta y reduce el tiempo perdido en seguimiento manual.", "violet"],
      ["Prospección con IA", "Encuentra clientes potenciales y crea una base accionable.", "green"],
    ],
    bodySections: [
      {
        title: "Qué es TalIA en la práctica",
        lead: "La página debe explicar el producto como una operación comercial, no como un concepto abstracto.",
        mode: "cards",
        items: [
          ["Responder", "Atiende el primer contacto sin perder velocidad.", "blue"],
          ["Ordenar", "Conecta chats, pipeline y seguimiento en una sola lógica.", "violet"],
          ["Convertir", "Lleva el interés hacia demo, cita o cotización.", "green"],
        ],
      },
      {
        title: "Dónde aporta más",
        lead: "El visitante debe reconocer rápido si su problema se parece al de TalIA.",
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
    sectionLead: "Aquí se concentra la intención más comercial: CRM, IA, WhatsApp, ventas y seguimiento en una sola URL. La página debe dejar claro que el valor no es solo responder, sino ordenar todo el proceso comercial.",
    cards: [
      ["Centraliza leads", "No pierdas prospectos entre chats o notas sueltas.", "blue"],
      ["Ordena el pipeline", "Ver etapas, responsables y próximos pasos es clave para convertir.", "violet"],
      ["Automatiza seguimiento", "Recordatorios y respuestas automáticas sin perder contexto humano.", "green"],
    ],
    bodySections: [
      {
        title: "Qué incluye el CRM",
        lead: "La página debe explicar la estructura operativa del producto, no solo repetir la palabra CRM.",
        mode: "cards",
        items: [
          ["Inbox comercial", "Todos los chats de WhatsApp organizados en un flujo de trabajo útil.", "blue"],
          ["Pipeline visual", "Cada oportunidad tiene etapa, responsable y siguiente acción.", "violet"],
          ["Seguimiento guiado", "Recordatorios y tareas para que el lead no se enfríe.", "green"],
        ],
      },
      {
        title: "Para quién es",
        lead: "Funciona mejor cuando el equipo vive de responder prospectos, cotizar y dar seguimiento diario.",
        mode: "cards",
        items: [
          ["Ventas", "Equipos que miden velocidad de respuesta y cierre.", "blue"],
          ["Atención comercial", "Empresas que cotizan por WhatsApp todos los días.", "violet"],
          ["Dirección", "Quienes necesitan ver el estado real del pipeline.", "green"],
        ],
      },
      {
        title: "Cómo se implementa",
        lead: "Conviene explicar la adopción para que el visitante entienda que no es solo software, sino orden comercial.",
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
    sectionLead: "El asistente no reemplaza al equipo: reduce trabajo repetitivo y mejora la velocidad de atención.",
    cards: [
      ["Atiende", "Da respuesta inmediata y mantiene viva la conversación.", "blue"],
      ["Registra", "Guarda datos clave para el equipo comercial.", "violet"],
      ["Deriva", "Pasa el caso al asesor cuando hay intención real.", "green"],
    ],
    bodySections: [
      {
        title: "Qué hace el asistente",
        lead: "La página debe explicar su rol dentro del flujo, no solo presentarlo como una herramienta genérica.",
        mode: "cards",
        items: [
          ["Recibir", "Responde el mensaje inicial sin demoras.", "blue"],
          ["Preguntar", "Obtiene datos útiles para calificar mejor.", "violet"],
          ["Pasar", "Entrega el caso al equipo solo cuando hay valor comercial.", "green"],
        ],
      },
      {
        title: "Cuándo conviene usarlo",
        lead: "Aquí se aclara en qué escenarios realmente aporta y por qué no es solo un extra decorativo.",
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
    sectionLead: "La IA de WhatsApp resuelve el inicio del flujo comercial: responder rápido, entender intención y llevar el caso al siguiente paso. La intención de búsqueda suele ser muy práctica; por eso hay que explicar el flujo completo.",
    cards: [
      ["Responde", "Contesta preguntas frecuentes y da contexto comercial.", "blue"],
      ["Califica", "Pregunta lo necesario para saber si el lead vale tiempo humano.", "violet"],
      ["Agenda", "Lleva al prospecto a cita o cotización sin fricción.", "green"],
    ],
    bodySections: [
      {
        title: "Flujo de atención",
        lead: "La página debe mostrar qué pasa desde que llega el mensaje hasta que el lead queda listo para un asesor.",
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
        lead: "Sirve cuando el volumen de chats o la velocidad de respuesta ya afectan conversiones.",
        mode: "cards",
        items: [
          ["Leads entrantes", "Cuando llegan muchas consultas y hay riesgo de dejar prospectos en visto.", "blue"],
          ["Fuera de horario", "Cuando necesitas atender después de horas sin perder oportunidades.", "violet"],
          ["Precalificación", "Cuando quieres filtrar antes de pasar el lead a un asesor humano.", "green"],
        ],
      },
      {
        title: "Qué debe sentir el usuario",
        lead: "La explicación debe dejar claro que la IA resuelve el primer contacto sin volver opaco el proceso.",
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
    sectionLead: "La IA para ventas no reemplaza al vendedor; le quita tareas repetitivas y le da mejor contexto para cerrar. La página debe hablar de productividad, conversión y control del pipeline, no solo de automatización.",
    cards: [
      ["Prioriza", "Detecta qué prospectos merecen atención primero.", "blue"],
      ["Acompaña", "No deja caer leads por falta de seguimiento.", "violet"],
      ["Estandariza", "Hace consistente la operación del equipo comercial.", "green"],
    ],
    bodySections: [
      {
        title: "Qué mejora en ventas",
        lead: "La página debe mostrar el impacto práctico en el trabajo comercial diario.",
        mode: "cards",
        items: [
          ["Orden", "Saber qué lead va primero y por qué.", "blue"],
          ["Velocidad", "Reducir el tiempo entre llegada del lead y primera respuesta.", "violet"],
          ["Conversión", "Aumentar la probabilidad de cierre con mejor contexto.", "green"],
        ],
      },
      {
        title: "Flujo comercial recomendado",
        lead: "Esta secuencia le da sentido al producto y ayuda a que el visitante entienda el uso real.",
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
    sectionLead: "No se trata de automatizar por automatizar. Se automatiza lo que consume tiempo y no aporta valor directo a la venta.",
    cards: [
      ["Captura", "Toma el lead y lo registra sin fricción.", "blue"],
      ["Movimiento", "Asigna etapas y responsables.", "violet"],
      ["Seguimiento", "Mantiene vivo el flujo hasta el cierre.", "green"],
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
    lede: "El seguimiento correcto convierte conversaciones en cierres. TalIA mantiene recordatorios, estado y contexto para que nada se enfríe. Esta página debe dejar claro que el valor está en sostener la venta, no solo en iniciar la conversación.",
    primaryCta: { label: "Ver seguimiento", href: "https://wa.me/5214443354450?text=Hola,%20quiero%20ver%20el%20seguimiento%20de%20ventas%20de%20Tal-IA" },
    secondaryCta: { label: "Ver automatización", href: "/automatizacion-de-ventas" },
    stats: [
      ["Recordatorios", "mensajes y tareas sin olvidos."],
      ["Contexto", "cada lead conserva historial."],
      ["Conversión", "menos fugas por falta de seguimiento."],
    ],
    sectionTitle: "Por qué importa",
    sectionLead: "En ventas, la velocidad de seguimiento define buena parte del resultado. Esta página captura esa intención y la traduce a un flujo claro para equipos que no pueden dejar prospectos en pausa.",
    cards: [
      ["Persistencia", "Mantén la conversación sin perseguir manualmente.", "blue"],
      ["Orden", "Sabes qué toca hacer con cada oportunidad.", "violet"],
      ["Visibilidad", "Ve el estado real del pipeline.", "green"],
    ],
    bodySections: [
      {
        title: "Qué resuelve el seguimiento",
        lead: "No basta con responder. Hay que sostener el proceso hasta que el lead avance o se descarte con criterio.",
        mode: "cards",
        items: [
          ["Leads fríos", "Recupera prospectos que se quedaron sin respuesta.", "blue"],
          ["Pendientes", "Evita que tareas y recordatorios se pierdan.", "violet"],
          ["Pipeline visible", "Permite ver en qué etapa está cada oportunidad.", "green"],
        ],
      },
      {
        title: "Cómo se trabaja",
        lead: "La página debe explicar el mecanismo, porque el usuario quiere saber cómo evitar fugas de seguimiento.",
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
    sectionLead: "El propósito es convertir intención en acción. Menos ida y vuelta, más citas y propuestas claras.",
    cards: [
      ["Agenda", "Reduce fricción para coordinar citas.", "blue"],
      ["Cotiza", "Envía propuestas con contexto comercial.", "violet"],
      ["Confirma", "Asegura asistencia y continuidad.", "green"],
    ],
    bodySections: [
      {
        title: "Qué pasa entre interés y cita",
        lead: "El usuario debe ver que aquí se resuelve el tramo donde muchas ventas se pierden: después del primer interés.",
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
        lead: "La página debe aterrizar cuándo esta solución es más valiosa.",
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
    sectionLead: "La prospección comercial debe terminar en una lista accionable, no en datos sueltos sin uso real. Esta página debe mostrar el paso previo a WhatsApp y a ventas, no solo la idea de 'buscar contactos'.",
    cards: [
      ["Encuentra", "Localiza prospectos con criterio comercial.", "blue"],
      ["Filtra", "Separa lo útil de lo irrelevante.", "violet"],
      ["Activa", "Convierte la lista en campañas y seguimiento.", "green"],
    ],
    bodySections: [
      {
        title: "Qué hace la prospección",
        lead: "La página debe explicar que prospectar es construir una base que sí pueda convertirse en venta.",
        mode: "cards",
        items: [
          ["Buscar", "Encontrar empresas o contactos con intención comercial.", "blue"],
          ["Depurar", "Quitar ruido y quedarte con oportunidades reales.", "violet"],
          ["Activar", "Pasar la lista a campañas, WhatsApp o seguimiento.", "green"],
        ],
      },
      {
        title: "Resultado esperado",
        lead: "No es solo encontrar datos; es dejar al equipo con una base lista para trabajar.",
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
    sectionLead: "La búsqueda de contactos debe acabar en una base que ventas pueda usar sin fricción.",
    cards: [
      ["Localiza", "Encuentra empresas y personas de interés.", "blue"],
      ["Depura", "Evita bases infladas y poco útiles.", "violet"],
      ["Entrega", "Pasa contactos listos al flujo de seguimiento.", "green"],
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
    sectionLead: "La intención aquí es capturar búsquedas específicas de prospectos por fuente y convertirlas en oportunidad real.",
    cards: [
      ["Google", "Extrae oportunidades de búsquedas y directorios.", "blue"],
      ["DENUE", "Aprovecha datos empresariales públicos.", "violet"],
      ["Activación", "Lleva esa base al flujo comercial.", "green"],
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
    sectionLead: "Marketing no es solo enviar mensajes; es saber a quién, cuándo y con qué seguimiento activar.",
    cards: [
      ["Campañas", "Diseña activaciones con propósito.", "blue"],
      ["Medición", "Mide aperturas, respuestas y avance.", "violet"],
      ["Reactivación", "Recupera leads que se enfriaron.", "green"],
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
    sectionLead: "La sección industrias concentra la navegación por sector y sirve como puente para contenido especializado.",
    cards: [
      ["Inmobiliarias", "Leads, citas y seguimiento comercial.", "blue"],
      ["Servicios", "Cotizaciones y atención rápida.", "violet"],
      ["Ventas B2B", "Prospección y seguimiento estructurado.", "green"],
    ],
    bodySections: [
      {
        title: "Para qué sirve esta sección",
        lead: "No solo agrupa industrias; también le ayuda al buscador y al usuario a entender cómo se organiza el sitio por vertical.",
        mode: "cards",
        items: [
          ["Descubrir", "Mostrar que cada industria tiene su propia página SEO.", "blue"],
          ["Navegar", "Llevar al usuario al caso de uso más cercano a su negocio.", "violet"],
          ["Convertir", "Guiar a demo o a la página de la vertical correcta.", "green"],
        ],
      },
      {
        title: "Cómo pensar la vertical",
        lead: "Cada industria tiene un lenguaje distinto, pero el objetivo sigue siendo el mismo: responder mejor y convertir más.",
        mode: "steps",
        items: [
          ["Detectar el caso", "Elegir la vertical que más se parece al negocio."],
          ["Leer el flujo", "Entender qué problema resuelve TalIA en ese sector."],
          ["Ir a la página", "Abrir la vista específica de la industria."],
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
    lede: "TalIA responde leads inmobiliarios en segundos, pregunta lo necesario y agenda citas sin depender del seguimiento manual. La página debe dejar claro que la prioridad es no perder interesados por tardanza.",
    primaryCta: { label: "Ver demo inmobiliaria", href: "https://wa.me/5214443354450?text=Hola,%20quiero%20ver%20la%20IA%20para%20inmobiliarias%20de%20Tal-IA" },
    secondaryCta: { label: "Ver industrias", href: "/industrias" },
    stats: [
      ["Responde", "sin dejar leads en visto."],
      ["Perfila", "zona, presupuesto y etapa."],
      ["Agenda", "citas y visitas automáticas."],
    ],
    sectionTitle: "En inmobiliarias",
    sectionLead: "La intención es capturar búsquedas de IA para inmobiliarias y mostrar un flujo claro de respuesta, calificación y cita. La página debe explicar por qué una respuesta rápida cambia la conversión en portales, campañas y referidos.",
    cards: [
      ["Leads", "Responde prospectos que llegan por campañas o portales.", "blue"],
      ["Citas", "Reduce el tiempo entre interés y visita.", "violet"],
      ["Seguimiento", "No pierdas compradores por falta de respuesta.", "green"],
    ],
    bodySections: [
      {
        title: "Casos de uso inmobiliarios",
        lead: "No todos los leads llegan igual. Esta sección explica dónde más valor aporta la automatización.",
        mode: "cards",
        items: [
          ["Portales", "Respuestas rápidas para leads que llegan desde portales inmobiliarios.", "blue"],
          ["Visitas", "Agenda recorridos y confirma asistencia sin fricción.", "violet"],
          ["Seguimiento", "Mantén vivos prospectos que todavía están comparando opciones.", "green"],
        ],
      },
      {
        title: "Qué busca el usuario",
        lead: "La página debe responder a la intención real: agendar más rápido, calificar mejor y perder menos interesados.",
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
    sectionLead: "Los servicios necesitan rapidez, cotización clara y seguimiento. Esa es la intención de esta página.",
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
    sectionLead: "La intención es dar una página sencilla para comercios que necesitan responder rápido y vender sin estructura pesada.",
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
    sectionLead: "La venta consultiva necesita seguimiento y contexto. Esta página captura esa intención.",
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
    sectionLead: "Turismo necesita disponibilidad, rapidez y claridad en la cotización. La página ataca esa búsqueda.",
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

function renderNav(depth = 0) {
  const prefix = "../".repeat(depth);
  const homeHref = depth ? `${prefix}` : "/";
  const pricesHref = depth ? `${prefix}precios` : "/precios";
  return `
  <header class="site-header">
    <div class="site-header__inner">
      <a class="brand" href="${homeHref}" aria-label="TalIA">
        <img src="${prefix}assets/logos/Logo8.png" alt="" aria-hidden="true" />
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
        <a class="nav__cta" href="https://wa.me/5214443354450?text=Hola,%20quiero%20una%20demo%20de%20Tal-IA" target="_blank" rel="noopener noreferrer">Agenda una demo</a>
      </nav>
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
    .map(([href, label]) => `<a class="link-card" href="${href}"><strong>${escapeHtml(label)}</strong><span>Ir a esta página SEO relacionada.</span></a>`)
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
    ${renderNav(depth)}

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
          <h2>Enlaces relacionados</h2>
          <p>La navegación interna ayuda a que Google descubra y entienda mejor el sitio, y además guía al usuario a la siguiente página útil.</p>
        </div>
      </div>
      <div class="section__subhead">Más de ${escapeHtml(sectionGroup.label)}</div>
      <div class="links-grid">
        ${siblingLinks}
      </div>
      <div class="section__subhead" style="margin-top: 18px;">Otras páginas útiles</div>
      <div class="links-grid">
        ${relatedLinks}
      </div>
    </section>

    ${extraSections}

    <section class="section">
      <div class="section__head">
        <div>
          <h2>Preguntas frecuentes</h2>
          <p>Respuestas cortas para reforzar la intención de búsqueda y la claridad comercial.</p>
        </div>
      </div>
      <div class="panel-grid">
        ${faq}
      </div>
    </section>

    <section class="cta-band">
      <div class="eyebrow">Siguiente paso</div>
      <h2 style="margin: 14px 0 0; font-size: clamp(28px, 3.2vw, 42px); line-height: 1; font-weight: 950;">${escapeHtml(page.headline)}</h2>
      <p>Si quieres, ahora convierto esta estructura en las rutas exactas del sitio y dejo el menú conectado a estas páginas SEO.</p>
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

    <div class="footer">TalIA · Página SEO generada para el refactor comercial.</div>
  </main>
</body>
</html>`;
}

for (const page of pages) {
  const outputPath = resolve(root, "src", page.output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, renderPage(page), "utf8");
}

console.log(`Generated ${pages.length} SEO pages.`);
