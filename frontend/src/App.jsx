import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Menu from "./pages/Menu";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";

import AdminDashboard from "./pages/AdminDashboard";
import CashierDashboard from "./pages/CashierDashboard";
import AdminProducts from "./pages/AdminProducts";
import AdminCategories from "./pages/AdminCategories";
import AdminAdditions from "./pages/AdminAdditions";
import AdminUsers from "./pages/AdminUsers";
import AdminReports from "./pages/AdminReports";
import CashierPOS from "./pages/CashierPOS";
import Profile from "./pages/Profile";
import CashierReports from "./pages/CashierReports";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Menu />} />
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute rolesPermitidos={["ADMIN"]} />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/productos" element={<AdminProducts />} />
          <Route path="/admin/categorias" element={<AdminCategories />} />
          <Route path="/admin/adicionales" element={<AdminAdditions />} />
          <Route path="/admin/usuarios" element={<AdminUsers />} />
          <Route path="/admin/reportes" element={<AdminReports />} />
        </Route>

        <Route
          element={
            <ProtectedRoute rolesPermitidos={["ADMIN", "CAJERO"]} />
          }
        >
          <Route path="/caja" element={<CashierDashboard />} />
          <Route path="/caja/ventas" element={<CashierPOS />} />
          <Route path="/caja/pendientes" element={<Navigate to="/caja/ventas" replace />} />
          <Route path="/perfil" element={<Profile />} />
          <Route path="/caja/reportes" element={<CashierReports />} />
        </Route>

        <Route path="*" element={<Menu />} />
      </Routes>
    </BrowserRouter>
  );
}
