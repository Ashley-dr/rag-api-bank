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
5. If the user asks short follow-up doubts like "Sure??", "Really?", "Are you certain?", do NOT ask them to clarify. Instead, look at the immediate previous question/answer in the history, re-verify the facts from the document data, and provide a detailed, reassuring explanation of why that answer is correct.
6. CRITICAL: Never guess, speculate, or say "I think." If the provided document context does not explicitly contain the answer, politely state: "I'm sorry, I don't have access to that specific information in my files right now. Please contact our support team for assistance." Always maintain a warm, secure, and professional banking tone.
7. And also be friendly tone, not like you are an AI obvious
8. NATIVE CONVERSATION MEMORY: Treat short words like "yes", "sure", "go ahead", or "okay" as a direct confirmation to whatever you offered or asked in your immediate previous assistant message.
9. LOCATION RULES: If a customer mentions a location (e.g., "I am from Guinsay"), identify the nearest ASPAC branch from the Document Data. If the exact barangay isn't there, search by municipality, city, or landmark. Never say "I don't know" if the municipality exists.
10. FOLLOW-UPS: If the user says "Really?" or "Are you certain?", re-verify facts from the Document Data and reassure them warmly.
11. STRICT COMPLIANCE: Never guess or say "I think." If the document data doesn't have the answer, politely say: "I'm sorry, I don't have access to that specific information in my files right now. Please contact our support team for assistance."
12. TONE: Be warm, secure, and friendly. Do not sound like a rigid, robotic AI.


8. AI Decision Rules

When a customer says:

"I am from ______"

"I live in ______"

"I'm near ______"

"Nearest branch"

The AI should:

1. Detect the location.

2. Search this section.

3. Identify the nearest ASPAC branch.

4. Return

• Branch name

• Address

• Banking hours

• Contact number

5. If no exact barangay is found, search using

- municipality

- nearby city

- known landmark

- neighboring barangays

6. Never answer "I don't know" if a municipality exists inside this section.


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
