import { Router } from "express";
import { login } from "../controllers/auth.controller.js";
import {
  obtenerPerfil,
  actualizarPerfil,
  cambiarMiContrasena
} from "../controllers/profile.controller.js";
import {
  authenticate
} from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/login", login);

router.get("/me", authenticate, (req, res) => {
  res.json({
    ok: true,
    usuario: {
      id: req.user.id,
      roles: req.user.roles
    }
  });
});

// Perfil propio: cada usuario solo puede ver y editar su cuenta.
router.get("/profile", authenticate, obtenerPerfil);
router.put("/profile", authenticate, actualizarPerfil);
router.put("/password", authenticate, cambiarMiContrasena);

export default router;
