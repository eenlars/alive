# OCR MCP Server

A lightweight MCP server providing OCR capabilities using RapidOCR with ONNX Runtime. Runs on CPU, no GPU required.

## Features

- **Fast**: ~0.1-0.3s per image on CPU
- **Free**: No API costs, runs locally
- **Accurate**: Based on PaddleOCR models, supports 100+ languages
- **Simple**: Two tools - base64 and file path input

## Structure

```
ocr/
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── requirements-dev.txt
├── README.md
├── src/
│   ├── server.py        # FastMCP server with tool definitions
│   └── ocr_engine.py    # OCR engine wrapper with dataclasses
└── test/
    └── test_ocr.py      # pytest tests (13 tests)
```

## Tools

| Tool | Description |
|------|-------------|
| `ocr_from_base64` | Extract text from base64-encoded image (handles data URI) |
| `ocr_from_path` | Extract text from image file path (validates path) |

## Quick Start

```bash
# Build
docker build -t mcp-ocr .

# Run
docker run -d --name mcp-ocr -p 8084:8084 --restart unless-stopped mcp-ocr

# Check health
docker ps  # Should show (healthy)
```

## Using with docker-compose

```bash
docker-compose up -d
```

## Response Format

```json
{
  "text": "Hello World",
  "blocks": [
    {
      "text": "Hello World",
      "confidence": 0.961,
      "box": [[20, 21], [108, 21], [108, 31], [20, 32]]
    }
  ]
}
```

On error:
```json
{
  "text": "",
  "blocks": [],
  "error": "Invalid base64: ..."
}
```

## MCP Protocol

The server uses **Streamable HTTP transport** on port 8084.

### 1. Initialize session

```bash
curl -i -X POST http://localhost:8084/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test", "version": "1.0"}}, "id": 1}'
```

Response header includes: `mcp-session-id: abc123...`

### 2. Call tool with session ID

```bash
curl -X POST http://localhost:8084/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "mcp-session-id: abc123..." \
  -d '{"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "ocr_from_base64", "arguments": {"image_base64": "iVBORw0KGgo..."}}, "id": 2}'
```

## Configuration

Environment variables:
- `OCR_PORT`: Server port (default: 8084)
- `OCR_HOST`: Bind address (default: 0.0.0.0)

## Testing

```bash
# Run tests inside container
docker exec mcp-ocr pip install pytest
docker exec mcp-ocr python -m pytest test_ocr.py -v

# 13 tests covering:
# - Engine initialization
# - Simple/multiline/empty text
# - Base64 decoding
# - Data URI handling
# - File path processing
# - RGBA/grayscale images
# - Small/large images
```

## Dependencies

- Python 3.12
- mcp >= 1.2.0 (Anthropic MCP SDK)
- rapidocr-onnxruntime >= 1.4.0
- pillow >= 10.0.0
- uvicorn >= 0.32.0

## Image Size

~835MB (includes ONNX Runtime and pre-downloaded OCR models)
