
import { Router } from "express";
import {
  listarProductosPublicos,
  listarProductosAdmin,
  crearProducto,
  actualizarProducto,
  desactivarProducto
} from "../controllers/product.controller.js";
import {
  authenticate,
  authorize
} from "../middlewares/auth.middleware.js";

const router = Router();

// Menú público.
router.get("/", listarProductosPublicos);

// Administración de productos.
router.get(
  "/admin",
  authenticate,
  authorize("ADMIN"),
  listarProductosAdmin
);

router.post(
  "/",
  authenticate,
  authorize("ADMIN"),
  crearProducto
);

router.put(
  "/:id",
  authenticate,
  authorize("ADMIN"),
  actualizarProducto
);

router.delete(
  "/:id",
  authenticate,
  authorize("ADMIN"),
  desactivarProducto
);

export default router;
