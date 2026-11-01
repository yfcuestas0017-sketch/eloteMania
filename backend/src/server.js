
import "dotenv/config";
import app from "./app.js";
import { initializeCashRegisterSchema } from "./config/cash-register-schema.js";

const PORT = Number(process.env.PORT) || 5000;

await initializeCashRegisterSchema();
const server = app.listen(PORT, () => {
  console.log(`Servidor iniciado en http://localhost:${PORT}`);
});

async function shutdown(signal) {
  console.log(`\n${signal}: cerrando servidor...`);

  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
