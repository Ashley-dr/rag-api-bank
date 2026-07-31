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

  const prompt = `
You are ASPAC Bank's AI Banking Assistant.

Conversation history is provided ONLY to understand follow-up questions.
Never mention or reveal previous conversations.

PREVIOUS CONVERSATION:
${conversationContext}

CURRENT CONTEXT (Document Data):
${context}

CURRENT QUESTION:
${question}

ROLE
- Help customers using ONLY the CURRENT CONTEXT (Document Data).
- Treat the CURRENT CONTEXT as the single source of truth.
- Answer the current question accurately and professionally.

DOCUMENT RULES
- Never invent, assume, estimate, or speculate.
- Never use outside knowledge.
- If the answer is not found in the CURRENT CONTEXT, reply:
  "I'm sorry, I don't have access to that specific information right now. Please contact our support team for assistance."

CONVERSATION RULES
- Use conversation history ONLY to resolve follow-up questions.
- Never mention conversation history.
- Never say:
  • "I remember..."
  • "Previously..."
  • "Earlier we discussed..."
  • "Based on our previous conversation..."
  • "As mentioned before..."
- Continue naturally without mentioning memory.

FOLLOW-UP RULES
Treat replies like:
- yes
- no
- okay
- sure
- continue
- next
- really?
- are you sure?

as referring to the most recent topic unless the user changes the subject.

LOCATION RULES
When the user mentions:
- barangay
- municipality
- city
- landmark
- branch

Find the nearest ASPAC branch from the CURRENT CONTEXT.

Search in this order:
1. Exact barangay
2. Municipality
3. City
4. Landmark
5. Service area

Never choose a branch that is not supported by the CURRENT CONTEXT.

OUTPUT STYLE
- Answer directly.
- Be concise.
- Do not explain your reasoning.
- Do not mention documents, retrieval, memory, AI, or embeddings.
- Keep answers under 100 words unless the user asks for more details.

If the user only asks for the nearest branch, return:

Nearest Branch:
<Branch Name>

Address:
<Address if available>

Banking Hours:
<Hours if available>

Contact Number:
<Contact if available>
`;

  try {
    console.log("⚡ Calling Groq API with memory...");

    const messages: GroqMessage[] = [
      {
        role: "system",
        content: `
You are ASPAC Bank's AI Banking Assistant.

Answer ONLY using the provided document data.

Use conversation history only to understand follow-up questions.

Never mention previous conversations.

Never mention memory.

Never mention documents.

Never mention retrieval.

Never guess.

Be concise and professional.
`,
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
        temperature: 0.2,
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
