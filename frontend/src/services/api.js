const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000/api"
).replace(/\/$/, "");

export const BACKEND_URL = API_URL.replace(/\/api$/, "");

export function formatearUrlImagen(url) {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
    return url;
  }
  return `${BACKEND_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

export async function apiFetch(ruta, opciones = {}) {
  const token = localStorage.getItem("pos_token");

  const headers = {
    ...(opciones.body && !(opciones.body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...opciones.headers
  };

  const respuesta = await fetch(`${API_URL}${ruta}`, {
    ...opciones,
    headers
  });

  const tipo = respuesta.headers.get("content-type") || "";
  const datos = tipo.includes("application/json")
    ? await respuesta.json()
    : await respuesta.text();

  // Token vencido o cuenta desactivada: se limpia la sesión y se vuelve al login.
  // (No aplica al propio login, donde un 401 significa credenciales incorrectas.)
  if (respuesta.status === 401 && ruta !== "/auth/login") {
    localStorage.removeItem("pos_token");
    localStorage.removeItem("pos_user");
    window.location.assign("/login");
  }

  if (!respuesta.ok) {
    throw new Error(
      datos?.mensaje || datos?.message || "Error de conexión con el servidor"
    );
  }

  return datos;
}

export async function subirFotoProducto(archivo) {
  const token = localStorage.getItem("pos_token");
  const formData = new FormData();
  formData.append("foto", archivo);

  const respuesta = await fetch(`${API_URL}/upload`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: formData
  });

  const datos = await respuesta.json();

  if (!respuesta.ok) {
    throw new Error(datos?.message || datos?.mensaje || "Error al subir la imagen");
  }

  return datos;
}
