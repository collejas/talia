import Link from "next/link";
import Image from "next/image";

const featureList = [
  {
    title: "Atiende a tus visitantes todo el día",
    detail: "El widget webchat mantiene una conversación contextualizada con cada tenant.",
  },
  {
    title: "Alimenta tu CRM automáticamente",
    detail:
      "Los leads que llegan desde cualquier sitio de tus clientes se registran en su tenant correspondiente.",
  },
  {
    title: "Carga el widget donde quieras",
    detail: "Instálalo como modal ligero o incrústalo en páginas de marketing sin mezclar datos.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-surface px-4 py-6">
      <header className="mx-auto max-w-5xl space-y-6 py-12 text-center sm:py-16">
        <Image
          src="/assets/logos/Logo8.png"
          alt="Tal-IA"
          width={96}
          height={96}
          className="mx-auto rounded-3xl border border-border/40 bg-surface-alt p-4 shadow-panel-soft"
          priority
        />
        <p className="text-sm uppercase tracking-[0.4em] text-muted-foreground">Tal-IA · multitenant</p>
        <h1 className="text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
          Tu asistente conversacional, la data de cada cliente bien guardada.
        </h1>
        <p className="mx-auto max-w-3xl text-lg leading-relaxed text-muted-foreground">
          Esta versión de prueba demuestra cómo cada tenant tiene su propio entorno: mensajes,
          visitas, productos y usuarios. Nadie ve lo que no le pertenece. Utiliza los enlaces de
          abajo para explorar el dashboard y el widget de contacto.
        </p>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="/webchat-landing"
            className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            Abrir el webchat
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-full border border-border/40 px-6 py-3 text-sm font-semibold text-foreground transition hover:bg-border/40"
          >
            Ver panel de métricas
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl space-y-8">
        <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-surface-alt/40 p-6 shadow-panel">
          <h2 className="text-2xl font-semibold text-foreground">Texto de prueba para tu landing</h2>
          <p className="text-base text-muted-foreground">
            Esta sección explica en lenguaje claro cómo funciona Tal-IA para tus clientes. Puedes
            cambiar este texto por el contenido real de tu página de marketing y luego reutilizar el
            botón del webchat para invitar a la gente a conversar.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          {featureList.map((feature) => (
            <article
              key={feature.title}
              className="rounded-2xl border border-border/40 bg-surface-alt/40 p-6 shadow-panel transition hover:border-primary/80"
            >
              <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{feature.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
