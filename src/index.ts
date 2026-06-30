// src/index.ts
// Main Express server entry point

import express, { Express } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { initDatabase } from "./config/init-db.js";
import { initEmbeddings } from "./services/embeddings.js";
import adminRoutes from "./routes/admin.js";
import chatRoutes from "./routes/chat.js";

dotenv.config();

const app: Express = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Routes
app.use("/api/admin", adminRoutes);
app.use("/api/chat", chatRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "RAG API Bank is running",
    timestamp: new Date().toISOString(),
  });
});


app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
    message: `Route ${req.method} ${req.path} does not exist`,
  });
});


app.use((err: Error, req: express.Request, res: express.Response) => {
  console.error("Express error:", err.message);
  res.status(500).json({
    error: "Server error",
    message: err.message,
  });
});


async function start(): Promise<void> {
  try {
    console.log("\n╔════════════════════════════════════════╗");
    console.log("║  RAG API BANK Server Starting...       ║");
    console.log("╚════════════════════════════════════════╝\n");

    console.log("📦 Initializing database...");
    const dbOk = await initDatabase();
    if (!dbOk) {
      throw new Error("Database initialization failed");
    }

    // Initialize embeddings model
    console.log("\n🧠 Initializing embedding model...");
    await initEmbeddings();

    // Start server
    app.listen(PORT, () => {
      console.log(`\n✅ Server running on http://localhost:${PORT}`);
      console.log("\n📚 API Endpoints:");
      console.log(`  POST   /api/chat              - Ask a question`);
      console.log(`  GET    /api/chat/health       - Check chatbot status`);
      console.log(
        `  POST   /api/admin/upload      - Upload document (admin only)`,
      );
      console.log(
        `  GET    /api/admin/documents   - List documents (admin only)`,
      );
      console.log(
        `  DELETE /api/admin/documents/:id - Delete document (admin only)`,
      );
      console.log(`\n🔐 Admin routes require X-API-Key header`);
      console.log(`\n💡 Next steps:`);
      console.log(`  1. Make sure PostgreSQL is running`);
      console.log(`  2. Make sure Ollama is running (ollama serve)`);
      console.log(`  3. Upload a document: POST /api/admin/upload`);
      console.log(`  4. Ask the chatbot: POST /api/chat\n`);
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Failed to start server:", errorMessage);
    process.exit(1);
  }
}

start();
