
import { Router } from "express";

import {
  checkout,
  listarPendientesEntrega,
  marcarPedidoEntregado
} from "../controllers/order.controller.js";

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

export default router;
