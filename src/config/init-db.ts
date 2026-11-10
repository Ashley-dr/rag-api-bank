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

    // Live "talk to a human" chat sessions (separate from AI conversations)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS handoff_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        chat_session_id TEXT,
        name TEXT NOT NULL,
        contact_method TEXT NOT NULL,
        contact TEXT NOT NULL,
        topic TEXT NOT NULL,
        details TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'waiting',
        customer_token_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        joined_at TIMESTAMPTZ,
        closed_at TIMESTAMPTZ,
        closed_by TEXT
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS handoff_messages (
        id BIGSERIAL PRIMARY KEY,
        handoff_id UUID NOT NULL REFERENCES handoff_sessions(id) ON DELETE CASCADE,
        sender TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_handoff_messages_session
      ON handoff_messages(handoff_id, id)
    `);
    console.log("✅ handoff tables ready");

    console.log("✅ Database initialization complete!");
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Database initialization failed:", errorMessage);
    return false;
  }
}
