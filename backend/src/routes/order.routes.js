
import { Router } from "express";

import {
  checkout,
  listarPendientesEntrega,
  marcarPedidoEntregado
} from "../controllers/order.controller.js";

import {
  obtenerPedidoParaEdicion,
  editarPedido,
  anularPedido
} from "../controllers/order-edit.controller.js";

import {
  authenticate,
  authorize
} from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate);

router.post(
  "/checkout",
  authorize("ADMIN", "CAJERO"),
  checkout
);

router.get(
  "/pendientes-entrega",
  authorize("ADMIN", "CAJERO"),
  listarPendientesEntrega
);

router.patch(
  "/entregar/:numeroComprobante",
  authorize("ADMIN", "CAJERO"),
  marcarPedidoEntregado
);

// Edición y eliminación de pedidos ya cobrados.
// El controlador valida que el cajero solo toque sus pedidos de hoy.
router.get(
  "/:pedidoId/edicion",
  authorize("ADMIN", "CAJERO"),
  obtenerPedidoParaEdicion
);

router.put(
  "/:pedidoId",
  authorize("ADMIN", "CAJERO"),
  editarPedido
);

router.delete(
  "/:pedidoId",
  authorize("ADMIN", "CAJERO"),
  anularPedido
);

export default router;
