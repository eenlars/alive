FROM python:3.12-slim

WORKDIR /app

# System deps for image processing (OpenCV needs these)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download OCR models to avoid first-run delay
RUN python -c "from rapidocr_onnxruntime import RapidOCR; RapidOCR()"

COPY src/ ./src/

WORKDIR /app/src

EXPOSE 8084

# Health check - MCP Streamable HTTP requires both Accept types
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -sf -o /dev/null http://localhost:8084/mcp -X POST \
        -H "Content-Type: application/json" \
        -H "Accept: application/json, text/event-stream" \
        -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"healthcheck","version":"1.0"}},"id":1}' \
    || exit 1

CMD ["python", "server.py"]
