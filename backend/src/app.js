import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import { testConnection } from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import productRoutes from "./routes/product.routes.js";
import orderRoutes from "./routes/order.routes.js";
import receiptRoutes from "./routes/receipt.routes.js";
import reportRoutes from "./routes/report.routes.js";
import paymentMethodRoutes from "./routes/payment-method.routes.js";
import userRoutes from "./routes/user.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import additionRoutes from "./routes/addition.routes.js";

const app = express();

app.disable("x-powered-by");
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim());

app.use(
  cors({
    origin(origin, callback) {
      // Permitir herramientas de servidor sin Origin.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origen no autorizado por CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

app.use(express.json({ limit: "1mb" }));

// Servir archivos estáticos subidos (fotos de productos)
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

app.get("/api/health", async (req, res, next) => {
  try {
    const database = await testConnection();

    res.json({
      ok: true,
      message: "API del restaurante funcionando",
      database: database.database,
      timestamp: database.server_time
    });
  } catch (error) {
    next(error);
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/additions", additionRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/receipts", receiptRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/payment-methods", paymentMethodRoutes);
app.use("/api/users", userRoutes);
app.use("/api/upload", uploadRoutes);

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    message: "Ruta no encontrada"
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  console.error(error);

  const status = error.message === "Origen no autorizado por CORS"
    ? 403
    : 500;

  res.status(status).json({
    ok: false,
    message: status === 403
      ? "Origen no autorizado"
      : "Error interno del servidor"
  });
});

export default app;
