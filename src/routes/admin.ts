import express, { Router, Request, Response } from "express";
import multer from "multer";
import { requireAdminKey } from "../middleware/auth.js";
import { parseFile } from "../services/fileParser.js";
import {
  processDocument,
  getDocuments,
  deleteDocument,
} from "../services/documentProcessor.js";
import type {
  ApiError,
  UploadResponse,
  ListDocumentsResponse,
  DeleteDocumentResponse,
} from "../types/index.js";

const router: Router = express.Router();

// Multer config: store files in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

/**
 * POST /api/admin/upload
 * Upload and process a file
 */
router.post(
  "/upload",
  requireAdminKey,
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file provided" } as ApiError);
        return;
      }

      console.log(`\n📤 Uploading file: ${req.file.originalname}`);

      // Parse the file
      const text = await parseFile(req.file.buffer, req.file.originalname);
      console.log(`✓ File parsed, ${text.length} characters extracted`);

      // Process and store in database
      const documentId = await processDocument(req.file.originalname, text);

      res.json({
        success: true,
        message: "Document uploaded and processed",
        documentId,
        filename: req.file.originalname,
        size: req.file.size,
      } as UploadResponse);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Upload error:", errorMessage);
      res.status(500).json({
        error: "Failed to process file",
        message: errorMessage,
      } as ApiError);
    }
  },
);

/**
 * GET /api/admin/documents
 * List all uploaded documents
 */
router.get(
  "/documents",
  requireAdminKey,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const documents = await getDocuments();
      res.json({
        success: true,
        count: documents.length,
        documents,
      } as ListDocumentsResponse);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Get documents error:", errorMessage);
      res.status(500).json({
        error: "Failed to retrieve documents",
        message: errorMessage,
      } as ApiError);
    }
  },
);

/**
 * DELETE /api/admin/documents/:id
 * Delete a document and all its chunks
 */
router.delete(
  "/documents/:id",
  requireAdminKey,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const filename = await deleteDocument(id);

      res.json({
        success: true,
        message: "Document deleted successfully",
        filename,
        id,
      } as DeleteDocumentResponse);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("Delete error:", errorMessage);
      res.status(500).json({
        error: "Failed to delete document",
        message: errorMessage,
      } as ApiError);
    }
  },
);

export default router;
