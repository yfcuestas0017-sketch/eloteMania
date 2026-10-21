import { Router } from "express";
import {
  obtenerResumen,
  obtenerVentasPorCajero,
  obtenerProductosMasVendidos,
  obtenerPedidosCajero
} from "../controllers/report.controller.js";
import {
  authenticate,
  authorize
} from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.get(
  "/resumen",
  authorize("ADMIN", "CAJERO"),
  obtenerResumen
);

router.get(
  "/ventas-por-cajero",
  authorize("ADMIN"),
  obtenerVentasPorCajero
);

router.get(
  "/productos-mas-vendidos",
  authorize("ADMIN"),
  obtenerProductosMasVendidos
);

router.get(
  "/pedidos-cajero",
  authorize("ADMIN", "CAJERO"),
  obtenerPedidosCajero
);

export default router;
