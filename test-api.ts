// test-api.ts
// Simple CLI tool to test the RAG API

import fs from "fs";
import fetch from "node-fetch";

const BASE_URL = "http://localhost:3000";
const ADMIN_KEY =
  process.env.ADMIN_API_KEY || "change-this-to-a-secret-key-123";

const args = process.argv.slice(2);
const command = args[0];

async function run(): Promise<void> {
  if (!command) {
    showHelp();
    return;
  }

  try {
    switch (command) {
      case "health":
        await checkHealth();
        break;
      case "chat":
        await chat(args.slice(1).join(" "));
        break;
      case "upload":
        await uploadFile(args[1]);
        break;
      case "list":
        await listDocuments();
        break;
      case "delete":
        await deleteDocument(args[1]);
        break;
      default:
        console.log(`Unknown command: ${command}`);
        showHelp();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Error:", errorMessage);
    process.exit(1);
  }
}

async function checkHealth(): Promise<void> {
  console.log("🏥 Checking server health...\n");
  const res = await fetch(`${BASE_URL}/health`);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

async function chat(message: string): Promise<void> {
  if (!message) {
    console.log('Usage: tsx test-api.ts chat "your question"');
    return;
  }

  console.log(`\n💬 Question: "${message}"\n`);

  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  const data = await res.json();
  console.log("Response:");
  console.log(JSON.stringify(data, null, 2));
}

async function uploadFile(filepath: string): Promise<void> {
  if (!filepath) {
    console.log("Usage: tsx test-api.ts upload ./your-file.pdf");
    return;
  }

  if (!fs.existsSync(filepath)) {
    throw new Error(`File not found: ${filepath}`);
  }

  console.log(`\n📤 Uploading: ${filepath}\n`);

  const FormData = (await import("form-data")).default;
  const form = new FormData();
  form.append("file", fs.createReadStream(filepath));

  const res = await fetch(`${BASE_URL}/api/admin/upload`, {
    method: "POST",
    headers: { "X-API-Key": ADMIN_KEY },
    body: form,
  });

  const data = await res.json();
  console.log("Response:");
  console.log(JSON.stringify(data, null, 2));
}

async function listDocuments(): Promise<void> {
  console.log("\n📚 Documents:\n");

  const res = await fetch(`${BASE_URL}/api/admin/documents`, {
    headers: { "X-API-Key": ADMIN_KEY },
  });

  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

async function deleteDocument(docId: string): Promise<void> {
  if (!docId) {
    console.log("Usage: tsx test-api.ts delete <document-id>");
    return;
  }

  console.log(`\n🗑️  Deleting: ${docId}\n`);

  const res = await fetch(`${BASE_URL}/api/admin/documents/${docId}`, {
    method: "DELETE",
    headers: { "X-API-Key": ADMIN_KEY },
  });

  const data = await res.json();
  console.log("Response:");
  console.log(JSON.stringify(data, null, 2));
}

function showHelp(): void {
  console.log(`
╔════════════════════════════════════════╗
║  RAG API Bank — Test CLI               ║
╚════════════════════════════════════════╝

USAGE:
  tsx test-api.ts <command> [args]

COMMANDS:
  health              Check server status
  chat <message>      Ask chatbot
  upload <file>       Upload document
  list                List documents
  delete <doc-id>     Delete document

EXAMPLES:
  tsx test-api.ts health
  tsx test-api.ts chat "What is your interest rate?"
  tsx test-api.ts upload bank-info.pdf
  tsx test-api.ts list
  tsx test-api.ts delete 550e8400-e29b-41d4-a716-446655440000

ADMIN KEY:
  Set: export ADMIN_API_KEY=your-secret-key
  `);
}

run();
