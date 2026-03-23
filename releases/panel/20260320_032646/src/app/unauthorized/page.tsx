export default function UnauthorizedPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">Acceso restringido</p>
      <h1 className="text-3xl font-semibold text-foreground">No tienes permiso para ver esta vista.</h1>
      <p className="text-base text-muted-foreground">
        Si necesitas acceso, pide a tu supervisor o admin que te asigne el permiso correspondiente.
      </p>
    </main>
  )
}
