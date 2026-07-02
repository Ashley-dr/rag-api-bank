import pool from "../config/db.js";
import { embedText } from "./embeddings.js";
import dotenv from "dotenv";
import type {
  ChatResponse,
  ChunkRow,
} from "../types/index.js";
import {  callGroqWithMemory } from './groq-llm.js'
import { getConversationHistory, saveConversation } from './conversation.js'
dotenv.config();


const TOP_K = parseInt(process.env.TOP_K_RESULTS || "5", 10);



export async function chatWithMemory(
  userMessage: string,
  sessionId: string
): Promise<ChatResponse & { session_id: string; conversation_history: any[], success: boolean, question: string }> {
  try {
    console.log(`💬 Message (Session: ${sessionId}):`, userMessage)

    // Step 1: Embed user question
    console.log('🔍 Embedding query...')
    const queryEmbedding = await embedText(userMessage)

    // Step 2: Search for relevant chunks
    console.log('📚 Searching database...')
    const relevantChunks = await retrieveChunks(queryEmbedding, TOP_K)

    if (relevantChunks.length === 0) {
      return {
        success: true,
        question: userMessage,
        answer: 'I do not have information about that in my database.',
        sources: [],
        chunksUsed: 0,
        session_id: sessionId,
        conversation_history: []
      }
    }

    // Step 3: Get conversation history
    console.log('📖 Loading conversation history...')
    const conversationHistory = await getConversationHistory(sessionId, 5)

    // Step 4: Build context from chunks
    const context = relevantChunks
      .map((chunk: ChunkRow, idx: number) => `[Source ${idx + 1}] ${chunk.content}`)
      .join('\n\n')

    // Step 5: Build conversation context
    const conversationContext = buildConversationContext(conversationHistory)

    // Step 6: Call LLM with both context and conversation history
    console.log('⚡ Calling Groq with conversation memory...')
    const answer = await callGroqWithMemory(
      userMessage,
      context,
      conversationContext
    )

    // Step 7: Save to conversation history
    await saveConversation(
      sessionId,
      userMessage,
      answer,
      relevantChunks.map((c: ChunkRow) => c.document_id),
      relevantChunks.length
    )

    // Step 8: Get updated history
    const updatedHistory = await getConversationHistory(sessionId, 5)

    return {
      success: true,
      question: userMessage,
      answer,
      sources: relevantChunks.map((c: ChunkRow) => c.document_id),
      chunksUsed: relevantChunks.length,
      session_id: sessionId,
      conversation_history: updatedHistory
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('RAG error:', errorMessage)
    throw error
  }
}

function buildConversationContext(conversationHistory: any[]): string {
  if (conversationHistory.length === 0) {
    return 'This is the start of the conversation.'
  }

  return conversationHistory
    .map(
      (msg, idx) =>
        `Previous Exchange ${idx + 1}:\nUser: ${msg.user_message}\nAssistant: ${msg.ai_response}`
    )
    .join('\n\n')
}


async function retrieveChunks(
  queryEmbedding: number[],
  topK = 5
): Promise<ChunkRow[]> {
  const result = await pool.query(
    `SELECT id, document_id, content, embedding <-> $1 as distance
     FROM document_chunks
     ORDER BY distance ASC
     LIMIT $2`,
    [JSON.stringify(queryEmbedding), topK]
  )
  return result.rows
}