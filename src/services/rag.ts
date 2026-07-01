import pool from "../config/db.js";
import { embedText } from "./embeddings.js";
import dotenv from "dotenv";
import type {
  ChatResponse,
  ChunkRow,
  OllamaRequest,
  OllamaResponse,
} from "../types/index.js";
import { callGroq } from './groq-llm.js'
dotenv.config();

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "phi3";
const TOP_K = parseInt(process.env.TOP_K_RESULTS || "10", 10);

// console.log(`Using Ollama: ${OLLAMA_BASE_URL} (model=${OLLAMA_MODEL})`);

/**
 * Main RAG flow: embed query → retrieve chunks → send to LLM → return answer
 */
export async function chat(userMessage: string): Promise<ChatResponse> {
  try {
    // Step 1: Embed the user question
    console.log("🔍 Embedding query...");
    const queryEmbedding = await embedText(userMessage);

    // Step 2: Vector search for relevant chunks
    console.log("📚 Searching database for relevant chunks...");
    const relevantChunks = await retrieveChunks(queryEmbedding, TOP_K);

    if (relevantChunks.length === 0) {
      return {
        answer: "I do not have information about that in my database.",
        sources: [],
        message: "No relevant documents found",
      };
    }

    // Step 3: Build context from retrieved chunks
    const context = relevantChunks
      .map(
        (chunk: ChunkRow, idx: number) =>
          `[Source ${idx + 1}] ${chunk.content}`,
      )
      .join("\n\n");

    // Step 4: Send to Ollama with context
    console.log("🤖 Calling Ollama LLM...");
    // const answer = await callOllama(userMessage, context);
    const answer = await callGroq(userMessage, context)
    return {
      answer,
      sources: relevantChunks.map((c: ChunkRow) => c.document_id),
      chunksUsed: relevantChunks.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("RAG error:", errorMessage);
    throw error;
  }
}

/**
 * Vector similarity search in pgvector
 */
async function retrieveChunks(
  queryEmbedding: number[],
  topK = 5,
): Promise<ChunkRow[]> {
  try {
    const result = await pool.query(
      `SELECT id, document_id, content, embedding <-> $1 as distance
       FROM document_chunks
       ORDER BY distance ASC
       LIMIT $2`,
      [JSON.stringify(queryEmbedding), topK],
    );

    return result.rows;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Vector search error:", errorMessage);
    throw error;
  }
}

/**
 * Call Ollama LLM with context and question
 */
async function callOllama(question: string, context: string): Promise<string> {
  const prompt = `You are a helpful assistant. Answer the user's question based ONLY on the context provided below.

CONTEXT:
${context}

QUESTION: ${question}

ANSWER:
`;

  try {
    const requestBody: OllamaRequest = {
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
    };

    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    // const data: OllamaResponse = await response.json();
    const data = (await response.json()) as OllamaResponse;
    return data.response.trim();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Ollama error:", errorMessage);
    throw new Error(`Failed to get response from Ollama: ${errorMessage}`);
  }
}
