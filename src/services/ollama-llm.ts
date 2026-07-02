import type {
  OllamaRequest,
  OllamaResponse,
} from "../types/index.js";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "phi3";
export async function callOllama(question: string, context: string): Promise<string> {
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
