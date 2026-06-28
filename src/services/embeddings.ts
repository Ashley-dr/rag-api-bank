import { pipeline, FeatureExtractionPipeline } from "@xenova/transformers";
import type { RawEmbedding } from "../types/index.js";

type EmbeddingPipeline = {
  (text: string, options: object): Promise<RawEmbedding>;
};

let embeddingPipeline: FeatureExtractionPipeline | null = null;
/**
 * Initialize the embedding model
 */
export async function initEmbeddings(): Promise<void> {
  try {
    console.log("⏳ Loading embedding model...");
    embeddingPipeline = await pipeline(
      "feature-extraction",
      "Xenova/nomic-embed-text-v1",
    );
    console.log("✅ Embedding model loaded");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Failed to load embedding model:", errorMessage);
    throw error;
  }
}

/**
 * Generate embedding for a text string
 * Returns array of 768 numbers
 */
export async function embedText(text: string): Promise<number[]> {
  if (!embeddingPipeline) {
    throw new Error("Embedding model not initialized");
  }

  try {
    const embedding = await embeddingPipeline(text, {
      pooling: "mean",
      normalize: true,
    });

    // Convert to regular array
    // return Array.from(embedding.data as Float32Array | number[]);
    return Array.from(embedding.data);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Embedding error:", errorMessage);
    throw error;
  }
}
