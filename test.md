# RAG API BANK � Setup and Deployment Guide

This document explains how to install, configure, run, and test the RAG API BANK server with Docker.

## 1. Prerequisites

Before you begin, install the following tools on your host machine:

- **Docker Desktop**
  - Runs the API container and PostgreSQL database container.
- **Ollama App**
  - Hosts the local language model.
- **pgAdmin 4** (optional)
  - Visual tool for inspecting PostgreSQL and vector tables.

## 2. Create the `.env` file

At the project root, create a file named `.env` and add:

```env
# Database connection
DB_HOST=db
DB_PORT=5432
DB_NAME=rag_api
DB_USER=postgres
DB_PASSWORD=postgres

# API configuration
PORT=3000
ADMIN_API_KEY=252525
TOP_K_RESULTS=5

# Ollama configuration
OLLAMA_BASE_URL=http://docker.internal:11434
OLLAMA_MODEL=llama3.1
EMBEDDING_MODEL=Xenova/nomic-embed-text-v1
```

> Note: `DB_HOST=db` tells the app to use the Docker database service.

## 3. Example `docker-compose.yml`

Create `docker-compose.yml` in the project root with this content:

```yaml
version: "3.9"

services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    env_file:
      - .env
    environment:
      DB_HOST: db
      OLLAMA_BASE_URL: http://docker.internal:11434
    restart: unless-stopped
    depends_on:
      - db
    volumes:
      - ./uploads_temp:/usr/src/app/uploads_temp

  db:
    image: pgvector/pgvector:pg18
    restart: always
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: rag_api
    ports:
      - "5433:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

## 4. Start the system

1. Open Ollama and ensure your model is available.
2. Download the model if needed:

```powershell
ollama pull llama3.1
```

3. In the project folder, remove existing containers and volumes:

```powershell
docker compose down --volumes --remove-orphans
```

4. Start the stack:

```powershell
docker compose up --build
```

5. Wait for these messages:

```text
? Database initialization complete!
? Embedding model loaded
? Server running on http://localhost:3000
```

## 5. Optional: Connect with pgAdmin

To inspect data in pgAdmin:

- Open pgAdmin
- Register a new server
- Use these settings:
  - Host: `localhost`
  - Port: `5433`
  - Maintenance database: `postgres`
  - Username: `postgres`
  - Password: `postgres`

Then navigate to `Databases ? rag_api ? Schemas ? public ? Tables`.

## 6. Test the API

### 6.1 Health check

```bash
curl.exe http://localhost:3000/health
```

Expected response:

```json
{
  "status": "ok",
  "message": "RAG API Bank is running",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### 6.2 Upload a document

```powershell
curl.exe -X POST http://localhost:3000/api/admin/upload `
  -H "X-API-Key: 252525" `
  -F "file=@C:\path\to\your\file.docx"
```

Supported file types include PDF, DOCX, TXT, JPG, PNG, and more.

### 6.3 List documents

```bash
curl.exe http://localhost:3000/api/admin/documents \
  -H "X-API-Key: 252525"
```

### 6.4 Ask a question

```bash
curl.exe -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"What is the interest rate for savings accounts?"}'
```

### 6.5 Delete a document

```bash
curl.exe -X DELETE http://localhost:3000/api/admin/documents/550e8400-e29b-41d4-a716-446655440000 \
  -H "X-API-Key: 252525"
```

## 7. Thunder Client quick guide

### Upload a file

1. Click **New Request**
2. Method: `POST`
3. URL: `http://localhost:3000/api/admin/upload`
4. Headers: `X-API-Key: 252525`
5. Body: form-data, field name `file`
6. Attach the file and send

### List documents

1. Click **New Request**
2. Method: `GET`
3. URL: `http://localhost:3000/api/admin/documents`
4. Headers: `X-API-Key: 252525`

### Chat with your data

1. Click **New Request**
2. Method: `POST`
3. URL: `http://localhost:3000/api/chat`
4. Headers: `Content-Type: application/json`
5. Body:

```json
{
  "message": "What is the interest rate for savings accounts?"
}
```

### Delete a document

1. Click **New Request**
2. Method: `DELETE`
3. URL: `http://localhost:3000/api/admin/documents/{id}`
4. Headers: `X-API-Key: 252525`

## 8. Reference table

| Operation       | Method | URL                         | Headers                          | Body                        |
| --------------- | ------ | --------------------------- | -------------------------------- | --------------------------- |
| Health check    | GET    | `/health`                   | None                             | None                        |
| Upload file     | POST   | `/api/admin/upload`         | `X-API-Key`                      | Form-data file              |
| List documents  | GET    | `/api/admin/documents`      | `X-API-Key`                      | None                        |
| Delete document | DELETE | `/api/admin/documents/{id}` | `X-API-Key`                      | None                        |
| Chat            | POST   | `/api/chat`                 | `Content-Type: application/json` | `{ "message": "question" }` |
| Chat health     | GET    | `/api/chat/health`          | None                             | None                        |

## 9. Recommended workflow

1. `GET /health`
2. `POST /api/admin/upload`
3. `GET /api/admin/documents`
4. `POST /api/chat`
5. Repeat upload and chat as needed
6. `DELETE /api/admin/documents/{id}`

## 10. Common questions

**Q: Where do I find `X-API-Key`?**

A: In your `.env` file as `ADMIN_API_KEY`.

**Q: How do I upload multiple files?**

A: Send separate `POST /api/admin/upload` requests for each file.

**Q: Why is my upload failing?**

Checklist:

- `POST` method is used
- URL is correct
- `X-API-Key` header is present
- Body is form-data
- Field name is `file`
- The file path is valid

## 11. Example session

### Create a test file

```bash
cat > bank-info.txt << 'EOF'
Bank: ACME Bank
Interest Rate: 4.5%
Hours: 9AM-6PM
Phone: 1-800-ACME-BANK
EOF
```

### Health check

`GET http://localhost:3000/health`

Expected response:

```json
{ "status": "ok" }
```

### Upload file

`POST http://localhost:3000/api/admin/upload`

Header: `X-API-Key: 252525`
Body: Form-Data file `bank-info.txt`

### Ask a question

`POST http://localhost:3000/api/chat`

Header: `Content-Type: application/json`
Body:

```json
{ "message": "What is the interest rate?" }
```

Expected response:

```json
{ "answer": "Interest rate is 4.5%" }
```
