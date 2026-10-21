import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

const router = Router();

/*
 * Almacenamiento de fotos
 * -----------------------
 * - Si existen CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET,
 *   las fotos se suben a Cloudinary (recomendado en producción: el disco de
 *   Render se borra en cada despliegue/reinicio).
 * - Si no existen, se guardan en la carpeta local /uploads (desarrollo).
 */
const {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  CLOUDINARY_FOLDER = "elotemania"
} = process.env;

const usarCloudinary = Boolean(
  CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET
);

const uploadDir = path.resolve(process.cwd(), "uploads");

if (!usarCloudinary && !fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = usarCloudinary
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination(req, file, cb) {
        cb(null, uploadDir);
      },
      filename(req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
        const safeExt = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)
          ? ext
          : ".jpg";
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
        cb(null, `prod-${uniqueSuffix}${safeExt}`);
      }
    });

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB
  },
  fileFilter(req, file, cb) {
    const permitidos = /jpeg|jpg|png|webp|gif/;
    const extname = permitidos.test(path.extname(file.originalname).toLowerCase());
    const mimetype = permitidos.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    }
    return cb(new Error("Solo se permiten imágenes (JPG, PNG, WEBP, GIF)."));
  }
});

// Sube el archivo (en memoria) a Cloudinary con una petición firmada.
async function subirACloudinary(file) {
  const timestamp = Math.floor(Date.now() / 1000);

  // Los parámetros firmados van en orden alfabético.
  const firma = crypto
    .createHash("sha1")
    .update(
      `folder=${CLOUDINARY_FOLDER}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`
    )
    .digest("hex");

  const form = new FormData();
  form.append(
    "file",
    new Blob([file.buffer], { type: file.mimetype }),
    file.originalname
  );
  form.append("api_key", CLOUDINARY_API_KEY);
  form.append("timestamp", String(timestamp));
  form.append("folder", CLOUDINARY_FOLDER);
  form.append("signature", firma);

  const respuesta = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body: form }
  );

  const datos = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok || !datos.secure_url) {
    throw new Error(
      datos?.error?.message || "Cloudinary no pudo guardar la imagen."
    );
  }

  return datos;
}

// POST /api/upload
router.post(
  "/",
  authenticate,
  authorize("ADMIN"),
  (req, res) => {
    upload.single("foto")(req, res, async (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            ok: false,
            message: "La imagen no debe superar los 5 MB."
          });
        }
        return res.status(400).json({
          ok: false,
          message: `Error al subir la imagen: ${err.message}`
        });
      }
      if (err) {
        return res.status(400).json({
          ok: false,
          message: err.message || "Error al procesar la imagen."
        });
      }
      if (!req.file) {
        return res.status(400).json({
          ok: false,
          message: "No se seleccionó ningún archivo de imagen."
        });
      }

      try {
        if (usarCloudinary) {
          const resultado = await subirACloudinary(req.file);

          return res.status(201).json({
            ok: true,
            message: "Foto subida correctamente.",
            url: resultado.secure_url,
            filename: resultado.public_id
          });
        }

        return res.status(201).json({
          ok: true,
          message: "Foto subida correctamente.",
          url: `/uploads/${req.file.filename}`,
          filename: req.file.filename
        });
      } catch (error) {
        console.error("Error subiendo imagen:", error.message);
        return res.status(502).json({
          ok: false,
          message: "No se pudo guardar la imagen. Intenta de nuevo."
        });
      }
    });
  }
);

export default router;
