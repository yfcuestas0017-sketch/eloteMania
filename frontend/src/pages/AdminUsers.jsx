import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Power, Search, ShieldCheck, UserPlus } from "lucide-react";
import AppShell from "../components/AppShell";
import ConfirmDialog from "../components/ConfirmDialog";
import { apiFetch } from "../services/api";
import "./admin.css";
import "./AdminUsers.css";

const ROLES = [
  {
    valor: "ADMIN",
    nombre: "Administrador",
    detalle: "Gestión completa: productos, categorías, usuarios, reportes y caja."
  },
  {
    valor: "CAJERO",
    nombre: "Cajero",
    detalle: "Solo ventas y comprobantes de pedidos."
  }
];

const formularioInicial = {
  nombres: "",
  apellidos: "",
  correo: "",
  telefono: "",
  nombre_usuario: "",
  contrasena: "",
  confirmacion: "",
  rol: "CAJERO",
  activo: "true"
};

function nombreRol(rol) {
  return ROLES.find((r) => r.valor === rol)?.nombre || rol;
}

export default function AdminUsers() {
  const [usuarios, setUsuarios] = useState([]);
  const [formulario, setFormulario] = useState(formularioInicial);
  const [vista, setVista] = useState("lista");
  const [editando, setEditando] = useState(null);
  const [rolTocado, setRolTocado] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroRol, setFiltroRol] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [aCambiar, setACambiar] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function cargarUsuarios() {
    try {
      const datos = await apiFetch("/users");
      setUsuarios(datos.usuarios);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    cargarUsuarios();
  }, []);

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    return usuarios.filter((usuario) => {
      if (
        texto &&
        !`${usuario.nombres} ${usuario.apellidos} ${usuario.nombre_usuario} ${usuario.correo || ""}`
          .toLowerCase()
          .includes(texto)
      ) {
        return false;
      }

      if (filtroRol && !(usuario.roles || []).includes(filtroRol)) return false;
      if (filtroEstado === "activos" && !usuario.activo) return false;
      if (filtroEstado === "inactivos" && usuario.activo) return false;

      return true;
    });
  }, [usuarios, busqueda, filtroRol, filtroEstado]);

  const conRol = (rol) => usuarios.filter((u) => (u.roles || []).includes(rol)).length;

  function cambiarCampo(event) {
    setFormulario({ ...formulario, [event.target.name]: event.target.value });
  }

  function nuevoUsuario() {
    setEditando(null);
    setFormulario(formularioInicial);
    setRolTocado(true);
    setError("");
    setVista("formulario");
  }

  function editarUsuario(usuario) {
    const roles = usuario.roles || [];

    setEditando(usuario);
    setFormulario({
      ...formularioInicial,
      nombres: usuario.nombres || "",
      apellidos: usuario.apellidos || "",
      correo: usuario.correo || "",
      telefono: usuario.telefono || "",
      nombre_usuario: usuario.nombre_usuario || "",
      rol: roles.includes("ADMIN") ? "ADMIN" : roles[0] || "CAJERO",
      activo: String(Boolean(usuario.activo))
    });
    setRolTocado(false);
    setError("");
    setVista("formulario");
  }

  function volverALista() {
    setVista("lista");
    setEditando(null);
    setFormulario(formularioInicial);
    setError("");
  }

  async function guardarUsuario(event) {
    event.preventDefault();
    setError("");

    if (formulario.contrasena || !editando) {
      if (formulario.contrasena.length < 8) {
        setError("La contraseña debe tener al menos 8 caracteres.");
        return;
      }

      if (formulario.contrasena !== formulario.confirmacion) {
        setError("Las contraseñas no coinciden.");
        return;
      }
    }

    setCargando(true);

    try {
      if (!editando) {
        await apiFetch("/users", {
          method: "POST",
          body: JSON.stringify({
            nombres: formulario.nombres,
            apellidos: formulario.apellidos,
            correo: formulario.correo,
            telefono: formulario.telefono,
            nombre_usuario: formulario.nombre_usuario,
            contrasena: formulario.contrasena,
            roles: [formulario.rol]
          })
        });
      } else {
        const id = editando.usuario_id;

        if (rolTocado) {
          await apiFetch(`/users/${id}/roles`, {
            method: "PUT",
            body: JSON.stringify({ roles: [formulario.rol] })
          });
        }

        const nuevoActivo = formulario.activo === "true";
        if (nuevoActivo !== Boolean(editando.activo)) {
          await apiFetch(`/users/${id}/estado`, {
            method: "PATCH",
            body: JSON.stringify({ activo: nuevoActivo })
          });
        }

        if (formulario.contrasena) {
          await apiFetch(`/users/${id}/password`, {
            method: "PUT",
            body: JSON.stringify({ contrasena: formulario.contrasena })
          });
        }
      }

      volverALista();
      await cargarUsuarios();
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  async function confirmarCambioEstado() {
    if (!aCambiar) return;
    setCargando(true);

    try {
      await apiFetch(`/users/${aCambiar.usuario_id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ activo: !aCambiar.activo })
      });

      setACambiar(null);
      await cargarUsuarios();
    } catch (err) {
      setACambiar(null);
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  const dialogo = (
    <ConfirmDialog
      abierto={Boolean(aCambiar)}
      titulo={
        aCambiar?.activo
          ? `¿Desactivar a ${aCambiar?.nombres}?`
          : `¿Activar a ${aCambiar?.nombres}?`
      }
      texto={
        aCambiar?.activo
          ? "Suspende su acceso sin perder el historial de ventas."
          : "Podrá volver a iniciar sesión con su usuario y contraseña."
      }
      confirmar={aCambiar?.activo ? "Sí, desactivar" : "Sí, activar"}
      peligro={Boolean(aCambiar?.activo)}
      cargando={cargando}
      onConfirmar={confirmarCambioEstado}
      onCancelar={() => setACambiar(null)}
    />
  );

  /* ---------------- Formulario ---------------- */

  if (vista === "formulario") {
    const soloLectura = Boolean(editando);

    return (
      <AppShell area="admin" seccion="Usuarios">
        <div className="pagina">
          <header className="pagina-cabecera">
            <div>
              <h1 className="pagina-titulo">
                {editando ? "Editar usuario" : "Crear usuario"}
              </h1>
              <p className="pagina-sub">
                Usuarios
                {editando && ` / ${editando.nombres} ${editando.apellidos} · ${editando.nombre_usuario}`}
              </p>
            </div>
          </header>

          {error && <p className="aviso aviso-error" role="alert">{error}</p>}

          <form className="formulario-rejilla" onSubmit={guardarUsuario}>
            <section className="tarjeta formulario-principal">
              <h2 className="tarjeta-titulo">Datos de la cuenta</h2>

              {soloLectura && (
                <p className="campo-ayuda">
                  Los datos personales no se modifican desde aquí. Puedes cambiar el
                  rol, el estado y la contraseña.
                </p>
              )}

              <div className="rejilla-2">
                <div className="campo">
                  <label htmlFor="u-nombres">Nombres *</label>
                  <input
                    id="u-nombres"
                    className="entrada"
                    name="nombres"
                    value={formulario.nombres}
                    onChange={cambiarCampo}
                    disabled={soloLectura}
                    required
                  />
                </div>

                <div className="campo">
                  <label htmlFor="u-apellidos">Apellidos *</label>
                  <input
                    id="u-apellidos"
                    className="entrada"
                    name="apellidos"
                    value={formulario.apellidos}
                    onChange={cambiarCampo}
                    disabled={soloLectura}
                    required
                  />
                </div>
              </div>

              <div className="rejilla-2">
                <div className="campo">
                  <label htmlFor="u-usuario">Nombre de usuario *</label>
                  <input
                    id="u-usuario"
                    className="entrada"
                    name="nombre_usuario"
                    autoComplete="off"
                    value={formulario.nombre_usuario}
                    onChange={cambiarCampo}
                    disabled={soloLectura}
                    required
                  />
                  <span className="campo-ayuda">Es su identificador para iniciar sesión.</span>
                </div>

                <div className="campo">
                  <label htmlFor="u-correo">Correo electrónico</label>
                  <input
                    id="u-correo"
                    className="entrada"
                    name="correo"
                    type="email"
                    value={formulario.correo}
                    onChange={cambiarCampo}
                    disabled={soloLectura}
                  />
                </div>
              </div>

              <div className="rejilla-2">
                <div className="campo">
                  <label htmlFor="u-telefono">Teléfono</label>
                  <input
                    id="u-telefono"
                    className="entrada"
                    name="telefono"
                    value={formulario.telefono}
                    onChange={cambiarCampo}
                    disabled={soloLectura}
                  />
                </div>

                {editando && (
                  <div className="campo">
                    <label htmlFor="u-estado">Estado de la cuenta</label>
                    <select
                      id="u-estado"
                      className="seleccion"
                      name="activo"
                      value={formulario.activo}
                      onChange={cambiarCampo}
                    >
                      <option value="true">Activo</option>
                      <option value="false">Inactivo</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="seccion-clave">
                <h2 className="tarjeta-titulo">Contraseña y seguridad</h2>
                <p className="campo-ayuda">
                  {editando
                    ? "Déjala vacía para conservar la actual."
                    : "Será la contraseña temporal de la cuenta."}
                </p>
              </div>

              <div className="rejilla-2">
                <div className="campo">
                  <label htmlFor="u-clave">
                    {editando ? "Nueva contraseña" : "Contraseña *"}
                  </label>
                  <input
                    id="u-clave"
                    className="entrada"
                    name="contrasena"
                    type="password"
                    minLength={editando && !formulario.contrasena ? undefined : 8}
                    autoComplete="new-password"
                    placeholder={editando ? "Sin cambios" : ""}
                    value={formulario.contrasena}
                    onChange={cambiarCampo}
                    required={!editando}
                  />
                </div>

                <div className="campo">
                  <label htmlFor="u-confirmacion">
                    {editando ? "Confirmar contraseña" : "Confirmar contraseña *"}
                  </label>
                  <input
                    id="u-confirmacion"
                    className="entrada"
                    name="confirmacion"
                    type="password"
                    autoComplete="new-password"
                    placeholder={editando ? "Sin cambios" : ""}
                    value={formulario.confirmacion}
                    onChange={cambiarCampo}
                    required={!editando || Boolean(formulario.contrasena)}
                  />
                </div>
              </div>
              <span className="campo-ayuda">Mínimo 8 caracteres.</span>

              <div className="formulario-pie">
                <span className="campo-ayuda">* Campos obligatorios</span>
                <div className="acciones">
                  <button type="button" className="btn btn-secundario" onClick={volverALista}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primario" disabled={cargando}>
                    <Check size={16} aria-hidden="true" />
                    {cargando ? "Guardando..." : "Guardar usuario"}
                  </button>
                </div>
              </div>
            </section>

            <aside className="formulario-lateral">
              <fieldset className="tarjeta tarjeta-pila roles">
                <legend className="tarjeta-titulo">Rol del usuario *</legend>

                {ROLES.map((rol) => (
                  <label
                    key={rol.valor}
                    className={`rol-opcion${formulario.rol === rol.valor ? " activo" : ""}`}
                  >
                    <input
                      type="radio"
                      name="rol"
                      value={rol.valor}
                      checked={formulario.rol === rol.valor}
                      onChange={() => {
                        setFormulario({ ...formulario, rol: rol.valor });
                        setRolTocado(true);
                      }}
                    />
                    <i aria-hidden="true" />
                    <span>
                      <strong>{rol.nombre}</strong>
                      <small>{rol.detalle}</small>
                    </span>
                  </label>
                ))}

              </fieldset>

              {editando && (
                <section className="tarjeta tarjeta-crema tarjeta-pila">
                  <h2 className="tarjeta-titulo">Acceso actual</h2>
                  <span>
                    <span className={`chip ${editando.activo ? "chip-verde" : ""}`}>
                      {editando.activo ? "Cuenta activa" : "Cuenta inactiva"}
                    </span>
                  </span>
                  <p className="campo-ayuda">
                    Los cambios de rol se aplican al iniciar una nueva sesión.
                  </p>
                  {formulario.rol !== "ADMIN" && (
                    <p className="sin-permisos">
                      <ShieldCheck size={16} aria-hidden="true" />
                      Sin permisos administrativos
                    </p>
                  )}
                </section>
              )}
            </aside>
          </form>
        </div>
      </AppShell>
    );
  }

  /* ---------------- Lista ---------------- */

  return (
    <AppShell area="admin" seccion="Usuarios">
      <div className="pagina">
        <header className="pagina-cabecera">
          <div>
            <h1 className="pagina-titulo">Tu equipo</h1>
            <p className="pagina-sub">
              Controla quién entra y qué puede hacer. Solo administradores pueden
              gestionar usuarios.
            </p>

            <div className="pagina-pastillas">
              <span className="chip">{usuarios.length} usuarios</span>
              <span className="chip chip-rojo">{conRol("ADMIN")} administradores</span>
              <span className="chip">{conRol("CAJERO")} cajeros</span>
              <span className="chip chip-verde">
                {usuarios.filter((u) => u.activo).length} activos
              </span>
            </div>
          </div>

          <button type="button" className="btn btn-primario" onClick={nuevoUsuario}>
            <UserPlus size={16} aria-hidden="true" />
            Crear usuario
          </button>
        </header>

        {error && <p className="aviso aviso-error" role="alert">{error}</p>}

        <section className="tarjeta">
          <div className="herramientas">
            <div className="busqueda">
              <Search size={18} aria-hidden="true" />
              <input
                className="entrada"
                type="search"
                placeholder="Buscar nombre, usuario o correo…"
                aria-label="Buscar usuario"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>

            <select
              className="seleccion"
              aria-label="Filtrar por rol"
              value={filtroRol}
              onChange={(e) => setFiltroRol(e.target.value)}
            >
              <option value="">Todos los roles</option>
              {ROLES.map((rol) => (
                <option key={rol.valor} value={rol.valor}>
                  {rol.nombre}
                </option>
              ))}
            </select>

            <select
              className="seleccion"
              aria-label="Filtrar por estado"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
            >
              <option value="">Todos los estados</option>
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
            </select>
          </div>

          <div className="tabla-contenedor tabla-tarjetas-contenedor">
            <table className="tabla tabla-tarjetas">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {filtrados.map((usuario) => (
                  <tr key={usuario.usuario_id}>
                    <td className="celda-titulo">
                      <div className="celda-doble">
                        <strong>
                          {usuario.nombres} {usuario.apellidos}
                        </strong>
                        <small>
                          {usuario.nombre_usuario}
                          {usuario.correo ? ` · ${usuario.correo}` : ""}
                        </small>
                      </div>
                    </td>
                    <td data-label="Rol">
                      <div className="roles-celda">
                        {(usuario.roles || []).map((rol) => (
                          <span
                            key={rol}
                            className={`chip ${rol === "ADMIN" ? "chip-rojo" : ""}`}
                          >
                            {nombreRol(rol)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td data-label="Estado">
                      <span className={`chip ${usuario.activo ? "chip-verde" : ""}`}>
                        {usuario.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="celda-acciones">
                      <div className="acciones">
                        <button
                          type="button"
                          className="btn-icono es-rojo"
                          onClick={() => editarUsuario(usuario)}
                          aria-label={`Editar a ${usuario.nombres}`}
                          title="Editar"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn-icono"
                          onClick={() => setACambiar(usuario)}
                          aria-label={`${usuario.activo ? "Desactivar" : "Activar"} a ${usuario.nombres}`}
                          title={usuario.activo ? "Desactivar" : "Activar"}
                        >
                          <Power size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan="4" className="vacio">
                      {usuarios.length === 0
                        ? "Aún no hay usuarios registrados."
                        : "Ningún usuario coincide con los filtros."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="tabla-pie">
            <span>
              Mostrando {filtrados.length} de {usuarios.length} usuarios
            </span>
            <span>Acciones: editar · activar / desactivar</span>
          </div>
        </section>
      </div>
      {dialogo}
    </AppShell>
  );
}
