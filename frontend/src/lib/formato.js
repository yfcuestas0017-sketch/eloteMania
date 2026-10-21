export function pesos(valor) {
  return Number(valor || 0)
    .toLocaleString("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0
    })
    .replace(/\$\s+/, "$")
    .replace(/^-\$/, "-$");
}

export function fechaLocal(fecha = new Date()) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

export function horaCorta(fecha) {
  if (!fecha) return "—";
  return new Date(fecha).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

export function fechaLarga(fecha = new Date()) {
  const texto = fecha.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function leerUsuario() {
  try {
    return JSON.parse(localStorage.getItem("pos_user") || "{}");
  } catch {
    return {};
  }
}

export function nombreVisible(usuario) {
  return usuario.nombres
    ? `${usuario.nombres}${usuario.apellidos ? ` ${usuario.apellidos}` : ""}`
    : usuario.nombre_usuario || "Equipo";
}
