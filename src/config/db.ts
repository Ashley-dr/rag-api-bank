import pg from "pg";
import dotenv from "dotenv";
import type { Pool as PgPool } from "pg";

dotenv.config();

const { Pool } = pg;

const pool: PgPool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  database: process.env.DB_NAME || "ragdb_bank",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "",
});

// Test connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error("❌ Database connection failed:", err.message);
    return;
  }
  if (client) {
    release();
  }
  console.log("✅ Database connected successfully");
});

export default pool;
