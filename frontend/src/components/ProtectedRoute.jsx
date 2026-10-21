import { Navigate, Outlet, useLocation } from "react-router-dom";

export default function ProtectedRoute({ rolesPermitidos = [] }) {
  const location = useLocation();
  const token = localStorage.getItem("pos_token");
  const usuarioGuardado = localStorage.getItem("pos_user");

  if (!token || !usuarioGuardado) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );
  }

  let usuario;

  try {
    usuario = JSON.parse(usuarioGuardado);
  } catch {
    localStorage.removeItem("pos_token");
    localStorage.removeItem("pos_user");
    return <Navigate to="/login" replace />;
  }

  const roles = Array.isArray(usuario.roles)
    ? usuario.roles
    : usuario.rol
      ? [usuario.rol]
      : [];

  const tienePermiso =
    rolesPermitidos.length === 0 ||
    rolesPermitidos.some((rol) => roles.includes(rol));

  if (!tienePermiso) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}