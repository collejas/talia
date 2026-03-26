export type InboxFolder = {
  id: string;
  label: string;
  count: number;
};

export type InboxThread = {
  id: string;
  sender: string;
  senderTitle?: string;
  subject: string;
  preview: string;
  time: string;
  unread?: boolean;
  tags?: string[];
  messages: Array<{
    id: string;
    author: string;
    role: "contacto" | "usuario";
    timestamp: string;
    body: string[];
  }>;
};

export type InboxSnapshot = {
  total: number;
  unread: number;
  awaiting: number;
  folders: InboxFolder[];
  threads: InboxThread[];
};

export const inboxSnapshot: InboxSnapshot = {
  total: 126,
  unread: 9,
  awaiting: 4,
  folders: [
    { id: "inbox", label: "Bandeja de entrada", count: 87 },
    { id: "asignados", label: "Asignados a mí", count: 32 },
    { id: "seguimiento", label: "Seguimiento", count: 14 },
    { id: "cerrados", label: "Cerrados", count: 56 },
  ],
  threads: [
    {
      id: "thread-1",
      sender: "Mariana Contreras",
      senderTitle: "Inversiones Contreras",
      subject: "Re: Demo coordinada para el jueves",
      preview: "Gracias por confirmar, el jueves a las 11 AM nos viene perfecto...",
      time: "Hace 45 min",
      unread: true,
      tags: ["Demo", "Alta prioridad"],
      messages: [
        {
          id: "thread-1-msg-1",
          author: "Mariana Contreras",
          role: "contacto",
          timestamp: "Jueves · 10:15",
          body: [
            "Hola Jorge, nos viene perfecto el jueves a las 11 AM.",
            "¿Podrías compartirnos el link de acceso y el material previo para revisar? También se sumarán dos personas del equipo de marketing.",
          ],
        },
        {
          id: "thread-1-msg-2",
          author: "Jorge Torre",
          role: "usuario",
          timestamp: "Jueves · 10:18",
          body: [
            "¡Excelente Mariana! Te acabo de enviar el link del Google Meet y adjunté el caso de éxito del condominio Altavista.",
            "Cualquier cosa, dime y ajustamos. Nos vemos el jueves.",
          ],
        },
      ],
    },
    {
      id: "thread-2",
      sender: "Luis López",
      senderTitle: "Plaza Central",
      subject: "Consulta sobre integración con WhatsApp",
      preview: "¿Podemos iniciar con 2 locales y después agregar el resto? Quiero validar que el equipo lo adopte...",
      time: "Hace 2 h",
      tags: ["Integración"],
      messages: [
        {
          id: "thread-2-msg-1",
          author: "Luis López",
          role: "contacto",
          timestamp: "Jueves · 08:22",
          body: [
            "Buen día, ¿es posible iniciar solo con dos locales y después incorporar el resto? Queremos validar la operación con el equipo.",
            "Además, ¿el número de WhatsApp queda operativo durante la migración?",
          ],
        },
        {
          id: "thread-2-msg-2",
          author: "Jorge Torre",
          role: "usuario",
          timestamp: "Jueves · 08:32",
          body: [
            "Hola Luis, sin problema. Podemos activar la licencia con los dos locales y escalar cuando estén listos.",
            "El número de WhatsApp no se interrumpe; hacemos la verificación en paralelo y queda activo al finalizar.",
          ],
        },
      ],
    },
    {
      id: "thread-3",
      sender: "Andrea Morales",
      senderTitle: "Residencial Monteverde",
      subject: "Documentación solicitada",
      preview: "Te comparto el listado de incidencias y los correos del comité para que los sumes a la distribución...",
      time: "Ayer",
      tags: ["Documentación"],
      messages: [
        {
          id: "thread-3-msg-1",
          author: "Andrea Morales",
          role: "contacto",
          timestamp: "Miércoles · 19:04",
          body: [
            "Hola Jorge, adjunto el listado de incidencias del último mes y los correos del comité de vigilancia para que los sumes a la distribución.",
            "Quedo atenta si necesitas algo más antes de la demo.",
          ],
        },
        {
          id: "thread-3-msg-2",
          author: "Jorge Torre",
          role: "usuario",
          timestamp: "Miércoles · 19:20",
          body: [
            "Gracias, Andrea. Ya quedó cargada la información, y agregué al comité al segmento de avisos.",
            "El viernes te mando el resumen de pendientes antes de la demo.",
          ],
        },
      ],
    },
  ],
};
