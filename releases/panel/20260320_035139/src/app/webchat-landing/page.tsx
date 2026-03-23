"use client";

type WebchatWidgetInstance = {
  start: () => void;
  stop: () => void;
};

type WebchatInitOptions = {
  tenantAlias?: string | null;
  apiBaseUrl?: string;
  chatLog?: HTMLElement | null;
  chatForm?: HTMLFormElement | null;
  chatInput?: HTMLInputElement | null;
  chatAttachmentButton?: HTMLElement | null;
  chatFileInput?: HTMLInputElement | null;
  chatAttachments?: HTMLElement | null;
  chatSubmitButton?: HTMLButtonElement | null;
};

type WebchatWidgetModule = {
  initialiseChat: (options?: WebchatInitOptions) => WebchatWidgetInstance;
};

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";

import styles from "./page.module.css";

const DEFAULT_TENANT_ALIAS = process.env.NEXT_PUBLIC_WEBCHAT_ALIAS ?? "default.local";
const API_BASE_URL = process.env.NEXT_PUBLIC_WEBCHAT_API_BASE ?? "/api/webchat";

export default function Page() {
  const [modalOpen, setModalOpen] = useState(false);
  const [widgetReady, setWidgetReady] = useState(false);
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const chatFormRef = useRef<HTMLFormElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);

  const heroSubtitle = useMemo(
    () =>
      "Incrusta el asistente TalIA en cualquier sitio de tus clientes y ofrece atención 24/7. El widget se conecta con el mismo backend y respeta el alias del tenant que elijas.",
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let widgetInstance: { stop?: () => void } | undefined;

    async function loadWidget() {
      if (!chatLogRef.current || !chatFormRef.current || !chatInputRef.current) {
        return;
      }
      try {
        const widgetUrl = "/webchat-widget.js";
        const widgetModule = (await import(/* webpackIgnore: true */ widgetUrl)) as WebchatWidgetModule;
        if (cancelled) return;
        widgetInstance = widgetModule.initialiseChat({
          tenantAlias: DEFAULT_TENANT_ALIAS,
          apiBaseUrl: API_BASE_URL,
          chatLog: chatLogRef.current,
          chatForm: chatFormRef.current,
          chatInput: chatInputRef.current,
          chatAttachmentButton: document.getElementById("chat-attachment-button"),
          chatFileInput: document.querySelector<HTMLInputElement>("#chat-file-input"),
          chatAttachments: document.getElementById("chat-attachments"),
        });
        setWidgetReady(true);
      } catch (error) {
        console.error("No se pudo cargar el widget de webchat:", error);
      }
    }

    loadWidget();

    return () => {
      cancelled = true;
      widgetInstance?.stop?.();
    };
  }, []);

  return (
    <div className={styles.page}>
      <div className={clsx(styles.layout, "layout")}>
        <section className={styles.hero}>
          <p className="eyebrow">Multitenant · Webchat</p>
          <h1>El widget de TalIA donde tus clientes quieran</h1>
          <p>{heroSubtitle}</p>
          <div className={styles.actions}>
            <button className={styles.ctaButton} onClick={() => setModalOpen(true)}>
              Probar el widget
            </button>
            <button className={styles.secondaryButton}>Ver documentación</button>
          </div>
        </section>
        <section className={styles.features}>
          {[
            {
              title: "Alias seguro",
              description:
                "Usamos `tenant_alias` para que cada sitio escriba en su tenant y nunca mezcle datos.",
            },
            {
              title: "Modal ligero",
              description:
                "El widget se ejecuta como un módulo, puedes cargarlo en un modal flotante dentro de cualquier landing.",
            },
            {
              title: "Backend compartido",
              description:
                "Las rutas REST en `app/channels/webchat` ya resuelven el tenant y mantienen historial por sesión.",
            },
          ].map((item) => (
            <article key={item.title} className={styles.featureCard}>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </section>
        <section className={styles.storybook}>
          <span>El modal del chat carga el mismo script y los mismos registros que tu landing.</span>
        </section>
      </div>

      <div className={styles.webchatModal} data-open={modalOpen ? "true" : "false"}>
        <div className={styles.modalBackdrop} onClick={() => setModalOpen(false)}></div>
        <div className={styles.modalPanel}>
          <header className={styles.modalHeader}>
            <div>
              <p className="eyebrow">Webchat</p>
              <h2>Asistente TalIA</h2>
            </div>
            <button type="button" onClick={() => setModalOpen(false)}>
              Cerrar
            </button>
          </header>
          <div className={styles.chatPanel}>
            <div className={styles.chatShell}>
              <div ref={chatLogRef} id="chat-log" className={styles.chatLog}></div>
            </div>
            <form ref={chatFormRef} id="chat-form" className={styles.chatForm}>
              <input
                ref={chatInputRef}
                id="chat-input"
                className={styles.chatInput}
                placeholder="Escribe tu mensaje..."
                autoComplete="off"
              />
              <button type="submit">Enviar</button>
            </form>
            <div className={styles.attachmentRow}>
              <button type="button" id="chat-attachment-button">
                Adjuntar
              </button>
              <input type="file" id="chat-file-input" hidden />
              <div id="chat-attachments" className="composer-attachments"></div>
            </div>
            {!widgetReady && (
              <p style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.6)" }}>
                Cargando widget...
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
