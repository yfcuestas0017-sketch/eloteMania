import { Router } from "express";
import {
  listarMetodosPago,
  crearMetodoPago
} from "../controllers/payment-method.controller.js";
import {
  authenticate,
  authorize
} from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/", listarMetodosPago);
router.post("/", authenticate, authorize("ADMIN"), crearMetodoPago);

export default router;