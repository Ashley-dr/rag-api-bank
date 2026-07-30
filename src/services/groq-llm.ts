import dotenv from "dotenv";

dotenv.config();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GroqResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export async function callGroqWithMemory(
  question: string,
  context: string,
  conversationContext: string,
): Promise<string> {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY not set");
  }

  const prompt = `You are a helpful banking assistant. You have access to previous conversations with this user.

PREVIOUS CONVERSATION:
${conversationContext}

CURRENT CONTEXT (Document Data):
${context}

CURRENT QUESTION: ${question}

Please answer the current question while:
1. Referencing previous conversations if relevant
2. Using ONLY the provided document context
3. Being consistent with previous answers
4. If asked about a numbered list from earlier, refer back to it

ANSWER:`;

  try {
    console.log("⚡ Calling Groq API with memory...");

    const messages: GroqMessage[] = [
      {
        role: "system",
        content:
          "You are a helpful banking assistant with memory of previous conversations. Answer based ONLY on provided context.",
      },
      {
        role: "user",
        content: prompt,
      },
    ];

    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages,
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const error =
        ((await response.json()) as { error?: { message?: string } }) || {};
      throw new Error(
        `Groq API error: ${error.error?.message || response.status}`,
      );
    }

    const data = (await response.json()) as GroqResponse;
    const answer = data.choices[0].message.content.trim();

    console.log("✅ Groq response received");
    return answer;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Groq error:", errorMessage);
    throw new Error(`Failed to get response from Groq: ${errorMessage}`);
  }
}

export async function callGroq(
  question: string,
  context: string,
): Promise<string> {
  return callGroqWithMemory(
    question,
    context,
    "This is the start of the conversation.",
  );
}
