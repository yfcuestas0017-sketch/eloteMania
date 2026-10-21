import { Router } from "express";
import {
  actualizarAdicional,
  crearAdicional,
  eliminarAdicional,
  listarAdicionales,
  listarAdicionalesParaVenta
} from "../controllers/addition.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

const router = Router();

router.get(
  "/venta",
  authenticate,
  authorize("ADMIN", "CAJERO"),
  listarAdicionalesParaVenta
);
router.use(authenticate, authorize("ADMIN"));
router.get("/", listarAdicionales);
router.post("/", crearAdicional);
router.put("/:id", actualizarAdicional);
router.delete("/:id", eliminarAdicional);

export default router;
