// src/services/documentProcessor.ts
// Chunk text, generate embeddings, store in database

import { v4 as uuidv4 } from "uuid";
import pool from "../config/db.js";
import { embedText } from "./embeddings.js";
import type { Document } from "../types/index.js";

/**
 * Process document: chunk text, embed, store in DB
 */
export async function processDocument(
  filename: string,
  text: string,
): Promise<string> {
  const documentId = uuidv4();

  try {
    // Insert document metadata
    await pool.query(
      "INSERT INTO documents (id, filename, filetype) VALUES ($1, $2, $3)",
      [documentId, filename, filename.split(".").pop()?.toLowerCase()],
    );

    // Chunk the text
    const chunks = chunkText(text, 500, 50);

    console.log(`📄 Processing "${filename}" into ${chunks.length} chunks...`);

    // Process each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Generate embedding
      const embedding = await embedText(chunk);

      // Insert chunk with embedding
      await pool.query(
        `INSERT INTO document_chunks (document_id, content, embedding, metadata)
         VALUES ($1, $2, $3, $4)`,
        [
          documentId,
          chunk,
          JSON.stringify(embedding),
          JSON.stringify({ chunkIndex: i, totalChunks: chunks.length }),
        ],
      );

      // Progress indicator
      if ((i + 1) % 5 === 0) {
        console.log(`  ✓ ${i + 1}/${chunks.length} chunks processed`);
      }
    }

    console.log(`✅ Document stored with ID: ${documentId}`);
    return documentId;
  } catch (error) {
    // Cleanup on error
    await pool.query("DELETE FROM documents WHERE id = $1", [documentId]);
    throw error;
  }
}

/**
 * Chunk text into overlapping pieces
 */
function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  const chunks: string[] = [];
  let i = 0;

  while (i < text.length) {
    const chunk = text.slice(i, i + chunkSize);
    if (chunk.trim()) {
      chunks.push(chunk);
    }
    i += chunkSize - overlap;
  }

  return chunks;
}

/**
 * Get all uploaded documents
 */
export async function getDocuments(): Promise<Document[]> {
  const result = await pool.query(
    `SELECT id, filename, filetype, upload_date FROM documents ORDER BY upload_date DESC`,
  );
  return result.rows;
}

/**
 * Delete document and all its chunks
 */
export async function deleteDocument(documentId: string): Promise<string> {
  const result = await pool.query(
    "DELETE FROM documents WHERE id = $1 RETURNING filename",
    [documentId],
  );

  if (result.rows.length === 0) {
    throw new Error("Document not found");
  }

  return result.rows[0].filename;
}
