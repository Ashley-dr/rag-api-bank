import pool from "./db.js";

export async function initDatabase(): Promise<boolean> {
  try {
    console.log("📦 Initializing database...");

    // Enable pgvector extension
    await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
    console.log("✅ pgvector extension enabled");

    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id TEXT NOT NULL,
        user_message TEXT NOT NULL,
        ai_response TEXT NOT NULL,
        sources TEXT[] DEFAULT '{}',
        chunks_used INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✅ Conversations table created");

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_conversation_session 
      ON conversations(session_id, created_at DESC)
    `);


    await pool.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        filename TEXT NOT NULL,
        filetype TEXT NOT NULL,
        upload_date TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✅ documents table created");

    // Create document_chunks table with vector embeddings
    await pool.query(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        embedding vector(768),
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✅ document_chunks table created");

    // Create index for fast vector similarity search
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_embedding_cosine 
      ON document_chunks USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    `);
    console.log("✅ vector search index created");

    console.log("✅ Database initialization complete!");
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Database initialization failed:", errorMessage);
    return false;
  }
}
