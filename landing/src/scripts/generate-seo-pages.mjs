#!/usr/bin/env node

const whatsappPhone = "5214443354450";

function whatsappHref(message) {
  return `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`;
}

const seoPages = [
  {
    path: "/",
    title: "TalIA | CRM con IA para vender por WhatsApp",
    description:
      "TalIA encuentra prospectos, responde por WhatsApp con IA, organiza tu CRM y da seguimiento hasta convertir conversaciones en ventas.",
    ctaLabel: "Hablar por WhatsApp",
    ctaMessage: "Hola, quiero conocer Tal-IA y ver cómo me ayuda a vender por WhatsApp.",
  },
  {
    path: "/que-es-talia",
    title: "Qué es TalIA | CRM con IA para WhatsApp",
    description:
      "TalIA es una plataforma comercial con inteligencia artificial diseñada para ayudar a las empresas a vender más por WhatsApp.",
    ctaLabel: "Quiero una demo",
    ctaMessage: "Hola, quiero conocer Tal-IA y ver una demo.",
  },
  {
    path: "/crm-con-ia-para-whatsapp",
    title: "CRM con IA para WhatsApp | TalIA",
    description: "CRM con IA para WhatsApp que centraliza leads, conversaciones, seguimiento y agenda comercial.",
    ctaLabel: "Ver demo",
    ctaMessage: "Hola, quiero ver el CRM con IA para WhatsApp de Tal-IA.",
  },
  {
    path: "/asistente-ia-empresas",
    title: "Asistente IA para empresas | TalIA",
    description: "Asistente IA para empresas que atiende conversaciones, pregunta, registra datos y conecta prospectos con tu CRM.",
    ctaLabel: "Pedir demo",
    ctaMessage: "Hola, quiero ver el asistente IA para empresas de Tal-IA.",
  },
  {
    path: "/ia-de-whatsapp",
    title: "IA de WhatsApp para empresas | TalIA",
    description: "IA de WhatsApp para responder, calificar y dar seguimiento comercial con CRM y automatización.",
    ctaLabel: "Ver demo de WhatsApp",
    ctaMessage: "Hola, quiero ver la IA de WhatsApp de Tal-IA.",
  },
  {
    path: "/ia-para-ventas",
    title: "IA para ventas | TalIA",
    description: "IA para ventas que ayuda a responder leads, calificar oportunidades y acelerar cierres con seguimiento automatizado.",
    ctaLabel: "Quiero ver IA para ventas",
    ctaMessage: "Hola, quiero ver la IA para ventas de Tal-IA.",
  },
  {
    path: "/automatizacion-de-ventas",
    title: "Automatización de ventas | TalIA",
    description: "Automatización de ventas para responder leads, mover pipeline y reducir trabajo manual en procesos comerciales.",
    ctaLabel: "Solicitar demo",
    ctaMessage: "Hola, quiero ver la automatización de ventas de Tal-IA.",
  },
  {
    path: "/seguimiento-ventas",
    title: "Seguimiento de ventas | TalIA",
    description: "Seguimiento de ventas automatizado para no dejar prospectos en visto y mantener cada oportunidad activa.",
    ctaLabel: "Ver seguimiento",
    ctaMessage: "Hola, quiero ver el seguimiento de ventas de Tal-IA.",
  },
  {
    path: "/agenda-y-cotizaciones",
    title: "Agenda y cotizaciones | TalIA",
    description: "Agenda y cotizaciones por WhatsApp con IA para convertir interés en citas y propuestas concretas.",
    ctaLabel: "Ver agenda",
    ctaMessage: "Hola, quiero ver agenda y cotizaciones de Tal-IA.",
  },
  {
    path: "/prospeccion",
    title: "Prospección | TalIA",
    description: "TalIA ayuda a encontrar empresas y obtener datos de contacto usando múltiples fuentes para construir listas comerciales útiles.",
    ctaLabel: "Ver prospección",
    ctaMessage: "Hola, quiero ver la prospección de Tal-IA.",
  },
  {
    path: "/prospeccion/google",
    title: "Google para prospección | TalIA",
    description: "TalIA ayuda a buscar empresas en Google Maps y Google Places para convertir búsquedas en prospectos listos para trabajar.",
    ctaLabel: "Ver Google",
    ctaMessage: "Hola, quiero ver Google para prospección en Tal-IA.",
  },
  {
    path: "/prospeccion/gob-mx",
    title: "Gob-MX para prospección | TalIA",
    description: "TalIA ayuda a buscar empresas en bases oficiales de México como DENUE para convertir datos públicos en prospectos comerciales.",
    ctaLabel: "Ver Gob-MX",
    ctaMessage: "Hola, quiero ver Gob-MX para prospección en Tal-IA.",
  },
  {
    path: "/prospeccion/buscar-contactos",
    title: "Buscar contactos de empresas | TalIA",
    description: "TalIA encuentra contactos de empresas como teléfonos, correos y sitios web para convertir búsquedas en prospectos listos para trabajar.",
    ctaLabel: "Buscar contactos",
    ctaMessage: "Hola, quiero buscar contactos de empresas con Tal-IA.",
  },
  {
    path: "/prospeccion/webscraper",
    title: "Web Scraper para prospección | TalIA",
    description: "TalIA usa Web Scraper para obtener teléfonos, correos, sitios web y datos visibles en páginas públicas para alimentar la prospección.",
    ctaLabel: "Ver Web Scraper",
    ctaMessage: "Hola, quiero ver Web Scraper para prospección en Tal-IA.",
  },
  {
    path: "/prospeccion-comercial",
    title: "Prospección comercial | TalIA",
    description: "Prospección comercial con IA para encontrar clientes, crear listas accionables y activar campañas útiles.",
    ctaLabel: "Quiero prospectar",
    ctaMessage: "Hola, quiero ver la prospección comercial de Tal-IA.",
  },
  {
    path: "/campanas-marketing",
    title: "Campañas y marketing con IA | TalIA",
    description: "Campañas y marketing con IA para activar prospectos, medir respuestas y reactivar leads fríos.",
    ctaLabel: "Ver campañas",
    ctaMessage: "Hola, quiero ver campañas y marketing con Tal-IA.",
  },
  {
    path: "/video-demostracion-inmobiliarias",
    title: "Video demostración inmobiliaria | TalIA",
    description: "Video del proceso inmobiliario con TalIA para mostrar cómo organiza inventario, seguimiento y operación comercial.",
    ctaLabel: "Ver video inmobiliario",
    ctaMessage: "Hola, quiero ver el video demo inmobiliario de Tal-IA.",
  },
  {
    path: "/industrias/inmobiliarias",
    title: "IA para inmobiliarias | TalIA",
    description: "IA para inmobiliarias por WhatsApp que responde leads, perfila compradores y agenda citas automáticamente.",
    ctaLabel: "Ver demo inmobiliaria",
    ctaMessage: "Hola, quiero ver la IA para inmobiliarias de Tal-IA.",
  },
  {
    path: "/industrias/servicios",
    title: "IA para servicios | TalIA",
    description: "IA para servicios que ayuda a cotizar, agendar, responder WhatsApp y dar seguimiento a solicitudes.",
    ctaLabel: "Ver demo de servicios",
    ctaMessage: "Hola, quiero ver IA para servicios con Tal-IA.",
  },
  {
    path: "/industrias/negocios-locales",
    title: "IA para negocios locales | TalIA",
    description: "IA para negocios locales que responde por WhatsApp, organiza leads y ayuda a vender más sin perder seguimiento.",
    ctaLabel: "Ver demo local",
    ctaMessage: "Hola, quiero ver IA para negocios locales con Tal-IA.",
  },
  {
    path: "/industrias/ventas-b2b",
    title: "IA para ventas B2B | TalIA",
    description: "IA para ventas B2B que ayuda a prospectar, calificar leads y dar seguimiento comercial estructurado.",
    ctaLabel: "Ver demo B2B",
    ctaMessage: "Hola, quiero ver IA para ventas B2B con Tal-IA.",
  },
  {
    path: "/industrias/turismo",
    title: "IA para turismo | TalIA",
    description: "IA para turismo que responde consultas, cotiza reservas y ayuda a agendar sin perder seguimiento.",
    ctaLabel: "Ver demo turismo",
    ctaMessage: "Hola, quiero ver IA para turismo con Tal-IA.",
  },
  {
    path: "/caracteristicas",
    title: "Características CRM con IA | TalIA",
    description: "TalIA reúne funciones clave para atender leads, organizar ventas y automatizar seguimiento.",
    ctaLabel: "Ver características",
    ctaMessage: "Hola, quiero ver las características de Tal-IA y entender cómo funciona.",
  },
  {
    path: "/precios",
    title: "Precios | CRM con IA para WhatsApp | TalIA",
    description: "Conoce los precios de TalIA y elige el plan que mejor se adapta a tu operación comercial.",
    ctaLabel: "Ver precios",
    ctaMessage: "Hola, quiero hablar por WhatsApp sobre los precios de Tal-IA.",
  },
];

const seoPagesByPath = Object.freeze(
  Object.fromEntries(
    seoPages.map((page) => [
      page.path,
      Object.freeze({
        ...page,
        whatsappHref: whatsappHref(page.ctaMessage),
      }),
    ]),
  ),
);

export { seoPages, seoPagesByPath, whatsappPhone, whatsappHref };

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(
    JSON.stringify(
      {
        pages: seoPages.length,
        ctas: seoPages.length,
        note: "This script now only stores SEO and CTA metadata. It no longer generates or rewrites HTML views.",
      },
      null,
      2,
    ),
  );
}
