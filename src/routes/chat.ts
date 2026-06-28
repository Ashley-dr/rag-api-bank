// src/routes/chat.ts
// Public routes: chat with the RAG system

import express, { Router, Request, Response } from "express";
import { chat } from "../services/rag.js";
import type { ApiError, ChatRequest } from "../types/index.js";

const router: Router = express.Router();

interface ChatRequestBody {
  message?: string;
}

/**
 * POST /api/chat
 * Send a message to the chatbot
 */
router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const { message } = req.body as ChatRequestBody;

    if (!message || typeof message !== "string" || message.trim() === "") {
      res.status(400).json({
        error: "Invalid request",
        message: "Message field is required and must be a non-empty string",
      } as ApiError);
      return;
    }

    console.log(`\n💬 User message: "${message}"`);

    // Get answer from RAG system
    const result = await chat(message);

    res.json({
      success: true,
      question: message,
      answer: result.answer,
      sources: result.sources,
      chunksUsed: result.chunksUsed,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Chat error:", errorMessage);
    res.status(500).json({
      error: "Failed to process chat",
      message: errorMessage,
    } as ApiError);
  }
});

/**
 * GET /api/chat/health
 * Check if chatbot is ready
 */
router.get("/health", (req: Request, res: Response): void => {
  res.json({
    status: "ok",
    message: "Chatbot is ready",
  });
});

export default router;
