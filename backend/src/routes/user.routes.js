import { Router } from "express";
import {
  listarUsuarios,
  crearUsuario,
  cambiarEstadoUsuario,
  eliminarUsuario,
  actualizarRolesUsuario,
  restablecerContrasena
} from "../controllers/user.controller.js";
import {
  authenticate,
  authorize
} from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticate, authorize("ADMIN"));

router.get("/", listarUsuarios);
router.post("/", crearUsuario);
router.delete("/:id", eliminarUsuario);
router.patch("/:id/estado", cambiarEstadoUsuario);
router.put("/:id/roles", actualizarRolesUsuario);
router.put("/:id/password", restablecerContrasena);

export default router;
