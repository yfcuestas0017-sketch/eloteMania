import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import eloteLogo from "../../../WhatsApp Image 2026-10-16 at 10.26.48 PM.jpeg";
import "../pages/StaffWorkspace.css";

const navegacion = {
  admin: [
    { to: "/admin", label: "Resumen", end: true },
    { to: "/admin/productos", label: "Productos" },
    { to: "/admin/categorias", label: "Categorías" },
    { to: "/admin/usuarios", label: "Equipo" },
    { to: "/admin/reportes", label: "Reportes" }
  ],
  caja: [
    { to: "/caja", label: "Resumen", end: true },
    { to: "/caja/ventas", label: "Punto de venta" },
    { to: "/caja/pendientes", label: "Pedidos pendientes" }
  ]
};

const titulos = {
  "/admin": "Resumen",
  "/admin/productos": "Productos",
  "/admin/categorias": "Categorías",
  "/admin/usuarios": "Equipo",
  "/admin/reportes": "Reportes",
  "/caja": "Resumen",
  "/caja/ventas": "Punto de venta",
  "/caja/pendientes": "Pedidos pendientes"
};

export default function StaffLayout({ tipo }) {
  const navigate = useNavigate();
  const location = useLocation();
  const usuario = JSON.parse(localStorage.getItem("pos_user") || "{}");
  const nombre = usuario.nombres || usuario.nombre_usuario || "Personal";

  function cerrarSesion() {
    localStorage.removeItem("pos_token");
    localStorage.removeItem("pos_user");
    navigate("/login", { replace: true });
  }

  return (
    <div className="staff-shell">
      <aside className="staff-sidebar">
        <Link to={tipo === "admin" ? "/admin" : "/caja"} className="staff-brand">
          <img src={eloteLogo} alt="" />
          <span>
            ELOTE
            <strong>MANÍA</strong>
          </span>
        </Link>

        <p className="staff-nav-label">
          {tipo === "admin" ? "ADMINISTRACIÓN" : "OPERACIÓN"}
        </p>
        <nav className="staff-nav" aria-label="Navegación principal">
          {navegacion[tipo].map((item, index) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `staff-nav-link${isActive ? " activa" : ""}`
              }
            >
              <span className="staff-nav-index">{String(index + 1).padStart(2, "0")}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="staff-sidebar-bottom">
          <Link to="/" className="staff-public-link">Ver catálogo público</Link>
          <button type="button" onClick={cerrarSesion} className="staff-logout">
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="staff-workarea">
        <header className="staff-topbar">
          <div>
            <span className="staff-topbar-kicker">
              Elote Manía <span>/</span> {tipo === "admin" ? "Administración" : "Caja"}
            </span>
            <strong>{titulos[location.pathname] || "Panel"}</strong>
          </div>
          <div className="staff-user">
            <span className="staff-user-avatar">{nombre.charAt(0).toUpperCase()}</span>
            <span>
              <strong>{nombre}</strong>
              <small>{tipo === "admin" ? "Administrador" : "Equipo de caja"}</small>
            </span>
          </div>
        </header>

        <div className="staff-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
