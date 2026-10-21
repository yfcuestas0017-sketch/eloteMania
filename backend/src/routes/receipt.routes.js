
import { Router } from "express";

import {
  obtenerComprobante,
  registrarImpresion
} from "../controllers/receipt.controller.js";

import {
  authenticate,
  authorize
} from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN", "CAJERO"));

router.get("/:id", obtenerComprobante);
router.post("/:id/impresiones", registrarImpresion);

export default router;
