import { useEffect, useState } from "react";
import { Check, Eye, EyeOff, KeyRound, UserRound } from "lucide-react";
import AppShell from "../components/AppShell";
import { apiFetch } from "../services/api";
import { leerUsuario } from "../lib/formato";
import "./admin.css";
import "./Profile.css";

const NOMBRE_ROL = { ADMIN: "Administrador", CAJERO: "Cajero" };

const contrasenasIniciales = {
  contrasena_actual: "",
  contrasena_nueva: "",
  confirmacion: ""
};

function fechaCorta(valor) {
  if (!valor) return "—";
  return new Date(valor).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

export default function Profile() {
  const sesion = leerUsuario();
  const roles = Array.isArray(sesion.roles) ? sesion.roles : [];
  const area = roles.includes("ADMIN") ? "admin" : "caja";

  const [perfil, setPerfil] = useState(null);
  const [datos, setDatos] = useState({
    nombres: "",
    apellidos: "",
    correo: "",
    telefono: ""
  });
  const [claves, setClaves] = useState(contrasenasIniciales);
  const [verClaves, setVerClaves] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);
  const [guardandoClave, setGuardandoClave] = useState(false);
  const [mensajePerfil, setMensajePerfil] = useState(null);
  const [mensajeClave, setMensajeClave] = useState(null);

  useEffect(() => {
    async function cargar() {
      try {
        const respuesta = await apiFetch("/auth/profile");
        const u = respuesta.usuario;

        setPerfil(u);
        setDatos({
          nombres: u.nombres || "",
          apellidos: u.apellidos || "",
          correo: u.correo || "",
          telefono: u.telefono || ""
        });
      } catch (err) {
        setMensajePerfil({ tipo: "error", texto: err.message });
      } finally {
        setCargando(false);
      }
    }

    cargar();
  }, []);

  function cambiarDato(event) {
    setDatos({ ...datos, [event.target.name]: event.target.value });
  }

  function cambiarClave(event) {
    setClaves({ ...claves, [event.target.name]: event.target.value });
  }

  async function guardarPerfil(event) {
    event.preventDefault();
    setMensajePerfil(null);
    setGuardandoPerfil(true);

    try {
      const respuesta = await apiFetch("/auth/profile", {
        method: "PUT",
        body: JSON.stringify(datos)
      });

      setPerfil(respuesta.usuario);

      // Mantiene actualizado el nombre que se muestra en la barra superior.
      localStorage.setItem(
        "pos_user",
        JSON.stringify({
          ...sesion,
          nombres: respuesta.usuario.nombres,
          apellidos: respuesta.usuario.apellidos
        })
      );

      setMensajePerfil({ tipo: "exito", texto: respuesta.message });
    } catch (err) {
      setMensajePerfil({ tipo: "error", texto: err.message });
    } finally {
      setGuardandoPerfil(false);
    }
  }

  async function guardarClave(event) {
    event.preventDefault();
    setMensajeClave(null);

    if (claves.contrasena_nueva.length < 8) {
      setMensajeClave({
        tipo: "error",
        texto: "La nueva contraseña debe tener al menos 8 caracteres."
      });
      return;
    }

    if (claves.contrasena_nueva !== claves.confirmacion) {
      setMensajeClave({
        tipo: "error",
        texto: "La confirmación no coincide con la nueva contraseña."
      });
      return;
    }

    setGuardandoClave(true);

    try {
      const respuesta = await apiFetch("/auth/password", {
        method: "PUT",
        body: JSON.stringify({
          contrasena_actual: claves.contrasena_actual,
          contrasena_nueva: claves.contrasena_nueva
        })
      });

      setClaves(contrasenasIniciales);
      setMensajeClave({ tipo: "exito", texto: respuesta.message });
    } catch (err) {
      setMensajeClave({ tipo: "error", texto: err.message });
    } finally {
      setGuardandoClave(false);
    }
  }

  const tipoCampo = verClaves ? "text" : "password";

  return (
    <AppShell area={area} seccion="Mi perfil">
      <div className="pagina">
        <header className="pagina-cabecera">
          <div>
            <h1 className="pagina-titulo">Mi perfil</h1>
            <p className="pagina-sub">
              Actualiza tus datos y cambia tu contraseña cuando lo necesites.
            </p>
          </div>
        </header>

        <div className="perfil-rejilla">
          <section className="tarjeta perfil-resumen" aria-label="Resumen de la cuenta">
            <span className="perfil-avatar" aria-hidden="true">
              <UserRound size={34} />
            </span>

            <h2>
              {perfil
                ? `${perfil.nombres}${perfil.apellidos ? ` ${perfil.apellidos}` : ""}`
                : "Cargando…"}
            </h2>

            <div className="perfil-roles">
              {(perfil?.roles || roles).map((rol) => (
                <span className="chip chip-rojo" key={rol}>
                  {NOMBRE_ROL[rol] || rol}
                </span>
              ))}
            </div>

            <dl className="lista-datos">
              <div>
                <dt>Usuario</dt>
                <dd>{perfil?.nombre_usuario || "—"}</dd>
              </div>
              <div>
                <dt>Miembro desde</dt>
                <dd>{fechaCorta(perfil?.creado_en)}</dd>
              </div>
              <div>
                <dt>Último acceso</dt>
                <dd>{fechaCorta(perfil?.ultimo_acceso)}</dd>
              </div>
            </dl>
          </section>

          <div className="perfil-formularios">
            <form
              className="tarjeta formulario-principal"
              onSubmit={guardarPerfil}
              aria-busy={cargando}
            >
              <h2 className="tarjeta-titulo">Datos personales</h2>

              {mensajePerfil && (
                <p
                  className={`aviso ${
                    mensajePerfil.tipo === "exito" ? "aviso-exito" : "aviso-error"
                  }`}
                  role={mensajePerfil.tipo === "exito" ? "status" : "alert"}
                >
                  {mensajePerfil.texto}
                </p>
              )}

              <div className="rejilla-2">
                <div className="campo">
                  <label htmlFor="pf-nombres">Nombres *</label>
                  <input
                    id="pf-nombres"
                    className="entrada"
                    name="nombres"
                    value={datos.nombres}
                    onChange={cambiarDato}
                    maxLength={100}
                    required
                    autoComplete="given-name"
                  />
                </div>

                <div className="campo">
                  <label htmlFor="pf-apellidos">Apellidos</label>
                  <input
                    id="pf-apellidos"
                    className="entrada"
                    name="apellidos"
                    value={datos.apellidos}
                    onChange={cambiarDato}
                    maxLength={100}
                    autoComplete="family-name"
                  />
                </div>
              </div>

              <div className="rejilla-2">
                <div className="campo">
                  <label htmlFor="pf-correo">Correo</label>
                  <input
                    id="pf-correo"
                    className="entrada"
                    name="correo"
                    type="email"
                    value={datos.correo}
                    onChange={cambiarDato}
                    maxLength={150}
                    autoComplete="email"
                  />
                </div>

                <div className="campo">
                  <label htmlFor="pf-telefono">Teléfono</label>
                  <input
                    id="pf-telefono"
                    className="entrada"
                    name="telefono"
                    type="tel"
                    inputMode="tel"
                    value={datos.telefono}
                    onChange={cambiarDato}
                    maxLength={30}
                    autoComplete="tel"
                  />
                </div>
              </div>

              <div className="campo">
                <label htmlFor="pf-usuario">Nombre de usuario</label>
                <input
                  id="pf-usuario"
                  className="entrada"
                  value={perfil?.nombre_usuario || ""}
                  disabled
                  readOnly
                />
                <span className="campo-ayuda">
                  El nombre de usuario solo lo puede cambiar un administrador.
                </span>
              </div>

              <div className="formulario-pie">
                <span className="campo-ayuda">* Campos obligatorios</span>
                <div className="acciones">
                  <button
                    type="submit"
                    className="btn btn-primario"
                    disabled={guardandoPerfil || cargando}
                  >
                    <Check size={16} aria-hidden="true" />
                    {guardandoPerfil ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>
              </div>
            </form>

            <form className="tarjeta formulario-principal" onSubmit={guardarClave}>
              <div className="perfil-titulo-fila">
                <h2 className="tarjeta-titulo">Cambiar contraseña</h2>
                <button
                  type="button"
                  className="btn-enlace perfil-ver"
                  onClick={() => setVerClaves((v) => !v)}
                  aria-pressed={verClaves}
                >
                  {verClaves ? (
                    <EyeOff size={15} aria-hidden="true" />
                  ) : (
                    <Eye size={15} aria-hidden="true" />
                  )}
                  {verClaves ? "Ocultar" : "Mostrar"}
                </button>
              </div>

              {mensajeClave && (
                <p
                  className={`aviso ${
                    mensajeClave.tipo === "exito" ? "aviso-exito" : "aviso-error"
                  }`}
                  role={mensajeClave.tipo === "exito" ? "status" : "alert"}
                >
                  {mensajeClave.texto}
                </p>
              )}

              <div className="campo">
                <label htmlFor="pf-actual">Contraseña actual *</label>
                <input
                  id="pf-actual"
                  className="entrada"
                  name="contrasena_actual"
                  type={tipoCampo}
                  value={claves.contrasena_actual}
                  onChange={cambiarClave}
                  autoComplete="current-password"
                  required
                />
              </div>

              <div className="rejilla-2">
                <div className="campo">
                  <label htmlFor="pf-nueva">Nueva contraseña *</label>
                  <input
                    id="pf-nueva"
                    className="entrada"
                    name="contrasena_nueva"
                    type={tipoCampo}
                    value={claves.contrasena_nueva}
                    onChange={cambiarClave}
                    minLength={8}
                    maxLength={72}
                    autoComplete="new-password"
                    required
                  />
                  <span className="campo-ayuda">Entre 8 y 72 caracteres.</span>
                </div>

                <div className="campo">
                  <label htmlFor="pf-confirmar">Confirmar contraseña *</label>
                  <input
                    id="pf-confirmar"
                    className="entrada"
                    name="confirmacion"
                    type={tipoCampo}
                    value={claves.confirmacion}
                    onChange={cambiarClave}
                    maxLength={72}
                    autoComplete="new-password"
                    required
                  />
                </div>
              </div>

              <div className="formulario-pie">
                <span className="campo-ayuda">
                  Tu sesión seguirá abierta después del cambio.
                </span>
                <div className="acciones">
                  <button
                    type="submit"
                    className="btn btn-primario"
                    disabled={guardandoClave}
                  >
                    <KeyRound size={16} aria-hidden="true" />
                    {guardandoClave ? "Actualizando..." : "Actualizar contraseña"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
