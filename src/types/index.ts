export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface Document {
  id: string;
  filename: string;
  filetype: string;
  upload_date: Date;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  created_at: Date;
}

export interface ChunkRow {
  id: string;
  document_id: string;
  content: string;
  distance: number;
}

export interface ChatResponse {
  answer: string;
  sources: string[];
  chunksUsed?: number;
  message?: string;
}

export interface ChatRequest {
  message: string;
}

export interface UploadResponse {
  success: boolean;
  message: string;
  documentId: string;
  filename: string;
  size: number;
}

export interface ApiError {
  error: string;
  message: string;
}

export interface ListDocumentsResponse {
  success: boolean;
  count: number;
  documents: Document[];
}

export interface DeleteDocumentResponse {
  success: boolean;
  message: string;
  filename: string;
  id: string;
}

export interface RawEmbedding {
  data: Float32Array | number[];
}

export interface OllamaRequest {
  model: string;
  prompt: string;
  stream: boolean;
}

export interface OllamaResponse {
  response: string;
  done: boolean;
}

export interface FileParseResult {
  text: string;
}
