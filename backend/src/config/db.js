
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("Falta configurar DATABASE_URL en el archivo .env");
}

// SSL: se activa con DATABASE_SSL=true o cuando la URL lo pide (Neon usa sslmode=require).
const usarSsl =
  process.env.DATABASE_SSL === "true" ||
  /sslmode=(require|verify-full|verify-ca)/.test(process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  ...(usarSsl ? { ssl: { rejectUnauthorized: true } } : {})
});

pool.on("error", (error) => {
  console.error("Error inesperado en el pool PostgreSQL:", error.message);
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function getClient() {
  return pool.connect();
}

export async function testConnection() {
  const result = await pool.query(
    "SELECT current_database() AS database, NOW() AS server_time"
  );

  return result.rows[0];
}

export default pool;
