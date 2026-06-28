// src/services/fileParser.ts
// Parse different file types and extract text

import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import Tesseract from "tesseract.js";

/**
 * Parse uploaded file and extract text
 * Supports: PDF, DOCX, TXT, JPG, PNG
 */
export async function parseFile(
  buffer: Buffer,
  filename: string,
): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase();

  try {
    switch (ext) {
      case "pdf":
        return await parsePDF(buffer);
      case "docx":
        return await parseDOCX(buffer);
      case "txt":
        return buffer.toString("utf-8");
      case "jpg":
      case "jpeg":
      case "png":
        return await parseImage(buffer, filename);
      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${ext}: ${errorMessage}`);
  }
}

/**
 * Parse PDF file
 */
async function parsePDF(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return data.text;
}

/**
 * Parse DOCX file
 */
async function parseDOCX(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/**
 * Parse image using OCR
 */
async function parseImage(buffer: Buffer, filename: string): Promise<string> {
  const { data } = await Tesseract.recognize(buffer, "eng");
  return data.text;
}
