import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Eye, EyeOff } from "lucide-react";
import { apiFetch } from "../services/api";
import { NEGOCIO } from "../config/negocio";
import logo from "../assets/logo-elote-mania.png";
import "./Login.css";

// Si copias una foto en src/assets/login-hero.(jpg|png|webp) aparece sola
// en el panel rojo. Si no existe, se muestra una composición del logo.
const fotos = import.meta.glob("../assets/login-hero.{jpg,jpeg,png,webp}", {
  eager: true,
  query: "?url",
  import: "default"
});
const fotoPanel = Object.values(fotos)[0];

const CLAVE_RECORDAR = "pos_recordar_usuario";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const usuarioRecordado = localStorage.getItem(CLAVE_RECORDAR) || "";

  const [nombreUsuario, setNombreUsuario] = useState(usuarioRecordado);
  const [contrasena, setContrasena] = useState("");
  const [verContrasena, setVerContrasena] = useState(false);
  const [recordar, setRecordar] = useState(Boolean(usuarioRecordado));
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function iniciarSesion(event) {
    event.preventDefault();
    setError("");
    setCargando(true);

    try {
      const respuesta = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          nombre_usuario: nombreUsuario,
          contrasena
        })
      });

      if (!respuesta.token || !respuesta.usuario) {
        throw new Error("El servidor no devolvió los datos de sesión esperados.");
      }

      localStorage.setItem("pos_token", respuesta.token);
      localStorage.setItem("pos_user", JSON.stringify(respuesta.usuario));

      if (recordar) {
        localStorage.setItem(CLAVE_RECORDAR, nombreUsuario);
      } else {
        localStorage.removeItem(CLAVE_RECORDAR);
      }

      const roles = respuesta.usuario.roles || [];

      const rutaPorRol = roles.includes("ADMIN")
        ? "/admin"
        : roles.includes("CAJERO")
          ? "/caja"
          : "/";

      const destinoSolicitado = location.state?.from?.pathname;

      navigate(destinoSolicitado || rutaPorRol, { replace: true });
    } catch (err) {
      setError(err.message || "No fue posible iniciar sesión.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="login-pagina">
      <aside className="login-marca" aria-hidden="true">
        <div className="login-marca-arriba">
          <img src={logo} alt="" width="132" height="132" />

          <h2>
            El sabor se sirve.
            <br />
            El negocio se cuida.
          </h2>

          <p>
            Productos, pedidos y caja en un solo lugar.
            <br />
            Bienvenido al equipo de {NEGOCIO.nombre}.
          </p>
        </div>

        {fotoPanel ? (
          <img className="login-foto" src={fotoPanel} alt="" />
        ) : (
          <div className="login-composicion">
            <span className="anillo a1" />
            <span className="anillo a2" />
            <img src={logo} alt="" width="200" height="200" />
          </div>
        )}

        <small>
          WhatsApp {NEGOCIO.whatsapp} · {NEGOCIO.nombre}
        </small>
      </aside>

      <section className="login-panel">
        <div className="login-contenido">
          <Link className="login-volver" to="/">
            <ArrowLeft size={16} aria-hidden="true" />
            Volver al catálogo público
          </Link>

          <div className="login-intro">
            <p className="login-etiqueta">Solo para personal</p>
            <h1>¡Hola, equipo!</h1>
            <p>Inicia sesión con tu usuario y contraseña para continuar.</p>
          </div>

          <form onSubmit={iniciarSesion} className="login-formulario">
            <div className="campo">
              <label htmlFor="nombre_usuario">Usuario</label>
              <input
                id="nombre_usuario"
                className="entrada"
                autoComplete="username"
                placeholder="Tu nombre de usuario"
                value={nombreUsuario}
                onChange={(e) => setNombreUsuario(e.target.value)}
                required
              />
            </div>

            <div className="campo">
              <label htmlFor="contrasena">Contraseña</label>
              <div className="login-clave">
                <input
                  id="contrasena"
                  className="entrada"
                  type={verContrasena ? "text" : "password"}
                  autoComplete="current-password"
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="btn-icono"
                  onClick={() => setVerContrasena((v) => !v)}
                  aria-label={
                    verContrasena ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  aria-pressed={verContrasena}
                >
                  {verContrasena ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <label className="login-recordar">
              <input
                type="checkbox"
                checked={recordar}
                onChange={(e) => setRecordar(e.target.checked)}
              />
              <span>Recordar mi usuario</span>
            </label>

            {error && (
              <p className="aviso aviso-error" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="btn btn-primario btn-bloque"
              disabled={cargando}
            >
              <ArrowRight size={16} aria-hidden="true" />
              {cargando ? "Ingresando..." : "Iniciar sesión"}
            </button>
          </form>

          <div className="login-rol">
            <strong>Tu espacio depende de tu rol</strong>
            <p>Administrador: gestión completa del negocio.</p>
            <p>Cajero: ventas y comprobantes de pedidos.</p>
          </div>

          <p className="login-nota">
            ¿No tienes acceso o olvidaste tu contraseña? Solicítalo al
            administrador.
            <br />
            El catálogo es público y no requiere iniciar sesión.
          </p>
        </div>
      </section>
    </main>
  );
}
