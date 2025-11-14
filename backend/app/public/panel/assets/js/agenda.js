document.addEventListener("DOMContentLoaded", () => {
  const status = document.getElementById("agenda-status");
  if (status) {
    status.textContent =
      "La gestión de citas está deshabilitada temporalmente mientras actualizamos la agenda.";
    status.classList.add("agenda-status-disabled");
  }
  console.info(
    "[agenda] Las acciones de creación y edición de citas están deshabilitadas en esta versión."
  );
});
