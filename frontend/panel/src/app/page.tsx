import Image from "next/image";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface font-sans">
      <main className="flex flex-col items-center gap-10 px-6 py-16 text-center md:max-w-2xl md:px-10">
        <Image
          src="/assets/logos/Logo8.png"
          alt="Tal-IA"
          width={96}
          height={96}
          className="rounded-2xl border border-border/40 bg-surface-alt p-3 shadow-panel-soft"
          priority
        />
        <div className="space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Bienvenido al panel de Tal-IA
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            Gestiona visitas, leads y métricas del webchat en un solo lugar. Accede al dashboard
            para visualizar actividad reciente, analizar conversaciones y administrar tu equipo.
          </p>
        </div>
        <a
          href="/auth/login"
          className="inline-flex items-center gap-2 rounded-full border border-primary/60 bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          Iniciar sesión
        </a>
      </main>
    </div>
  );
}
