import { Router } from "express";
import {
  abrirCaja,
  cerrarCaja,
  obtenerCajaDiariaAdmin,
  obtenerInventarioDiario,
  obtenerResumenCaja,
  registrarConteoInventario,
  registrarEgreso
} from "../controllers/cash-register.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate, authorize("ADMIN", "CAJERO"));
router.get("/resumen", obtenerResumenCaja);
router.get("/admin/dia", authorize("ADMIN"), obtenerCajaDiariaAdmin);
router.post("/abrir", abrirCaja);
router.post("/egresos", registrarEgreso);
router.post("/cerrar", cerrarCaja);
router.get("/inventario", obtenerInventarioDiario);
router.post("/inventario/conteo", registrarConteoInventario);

export default router;
