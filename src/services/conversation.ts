import { v4 as uuidv4 } from "uuid"
import pool from "../config/db.js"
import type { ConversationMessage } from "../types/index.js"

export async function saveConversation(
  sessionId: string,
  userMessage: string,
  aiResponse: string,
  sources: string[],
  chunksUsed: number
): Promise<ConversationMessage> {
  try {
    console.log("💾 Saving conversation to database...")

    const result = await pool.query(
      `INSERT INTO conversations (session_id, user_message, ai_response, sources, chunks_used)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, session_id, user_message, ai_response, sources, chunks_used, created_at`,
      [sessionId, userMessage, aiResponse, sources, chunksUsed]
    )

    console.log("✅ Conversation saved")
    return result.rows[0]
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error("Error saving conversation:", errorMessage)
    throw error
  }
}

export async function getConversationHistory(
  sessionId: string,
  limit: number = 10
): Promise<ConversationMessage[]> {
  try {
    console.log(`📖 Loading conversation history (last ${limit} messages)...`)

    const result = await pool.query(
      `SELECT id, session_id, user_message, ai_response, sources, chunks_used, created_at 
       FROM conversations 
       WHERE session_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [sessionId, limit]
    )

    const history = result.rows.reverse()
    console.log(`✅ Loaded ${history.length} previous messages`)

    return history
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error("Error retrieving conversation:", errorMessage)
    return []
  }
}

export function createSessionId(): string {
  return uuidv4()
}

export async function clearSessionConversation(
  sessionId: string
): Promise<void> {
  try {
    await pool.query(`DELETE FROM conversations WHERE session_id = $1`, [
      sessionId,
    ])
    console.log(`🧹 Cleared conversation for session: ${sessionId}`)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error("Error clearing conversation:", errorMessage)
  }
}