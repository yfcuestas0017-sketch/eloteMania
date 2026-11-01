import { Router } from "express";
import {
  ajustarInventarioAdmin,
  listarInventarioAdmin
} from "../controllers/cash-register.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate, authorize("ADMIN"));
router.get("/admin", listarInventarioAdmin);
router.patch("/:productoId", ajustarInventarioAdmin);

export default router;
