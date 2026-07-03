import express, { Router, Request, Response } from "express"
import { chatWithMemory } from "../services/rag.js"
import { createSessionId, clearSessionConversation } from "../services/conversation.js"
import type { ApiError } from "../types/index.js"
import pool from "../config/db.js"

const router: Router = express.Router()

interface ChatRequestBody {
  message?: string
  session_id?: string
}


router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { message, session_id } = req.body as ChatRequestBody

    if (!message || typeof message !== "string" || message.trim() === "") {
      res.status(400).json({
        error: "Invalid request",
        message: "Message field is required and must be a non-empty string",
      } as ApiError)
      return
    }

    console.log(`\n💬 User message: "${message}"`)

    const sessionId = session_id || createSessionId()
    console.log(`📍 Session ID: ${sessionId}`)

    const result = await chatWithMemory(message, sessionId)

    res.json({
      success: true,
      question: message,
      answer: result.answer,
      sources: result.sources,
      chunksUsed: result.chunksUsed,
      session_id: result.session_id,
      conversation_history: result.conversation_history,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error("Chat error:", errorMessage)
    res.status(500).json({
      error: "Failed to process chat",
      message: errorMessage,
    } as ApiError)
  }
})

router.get("/health", (req: Request, res: Response): void => {
  res.json({
    status: "ok",
    message: "Chatbot is ready with conversation memory",
  })
})



router.delete(
  "/session/:sessionId",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { sessionId } = req.params

      if (!sessionId) {
        res.status(400).json({
          error: "Invalid request",
          message: "sessionId is required",
        } as ApiError)
        return
      }

      console.log(`Deleting conversation for session: ${sessionId}`)

      // Delete from database
      const result = await pool.query(
        `DELETE FROM conversations WHERE session_id = $1`,
        [sessionId]
      )

      console.log(
        `✅ Deleted ${result.rowCount} conversation records from database`
      )

      res.json({
        success: true,
        message: "Conversation deleted successfully",
        deleted_count: result.rowCount,
        session_id: sessionId,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error("Delete session error:", errorMessage)
      res.status(500).json({
        error: "Failed to delete conversation",
        message: errorMessage,
      } as ApiError)
    }
  }
)

export default router