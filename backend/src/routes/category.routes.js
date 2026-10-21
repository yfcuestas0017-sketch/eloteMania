
import { Router } from "express";
import {
  listarCategorias,
  listarTodasCategorias,
  crearCategoria,
  actualizarCategoria,
  desactivarCategoria
} from "../controllers/category.controller.js";
import {
  authenticate,
  authorize
} from "../middlewares/auth.middleware.js";

const router = Router();

// Consulta pública del menú.
router.get("/", listarCategorias);

// Gestión administrativa.
router.get(
  "/admin",
  authenticate,
  authorize("ADMIN"),
  listarTodasCategorias
);

router.post(
  "/",
  authenticate,
  authorize("ADMIN"),
  crearCategoria
);

router.put(
  "/:id",
  authenticate,
  authorize("ADMIN"),
  actualizarCategoria
);

router.delete(
  "/:id",
  authenticate,
  authorize("ADMIN"),
  desactivarCategoria
);

export default router;
