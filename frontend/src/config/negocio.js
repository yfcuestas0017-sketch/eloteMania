// Datos del negocio usados en el catálogo, el login y el comprobante.
// Edita aquí el WhatsApp, el horario y el tiempo de preparación.
export const NEGOCIO = {
  nombre: "Elote Manía",
  eslogan: "Antojos mexicanos, a tu manera.",
  whatsapp: "3175221920",
  whatsappLink: "https://wa.me/573175221920",
  // Horario en formato 24 h (hora local del navegador).
  apertura: 14,
  cierre: 22,
  tiempoPreparacion: "8–12 min"
};

export function estaAbierto(fecha = new Date()) {
  const hora = fecha.getHours() + fecha.getMinutes() / 60;
  return hora >= NEGOCIO.apertura && hora < NEGOCIO.cierre;
}

export function textoHorario() {
  const dos = (n) => String(n).padStart(2, "0");
  return `${dos(NEGOCIO.apertura)}:00–${dos(NEGOCIO.cierre)}:00`;
}
