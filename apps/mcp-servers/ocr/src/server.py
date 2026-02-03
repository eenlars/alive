#!/usr/bin/env python3
"""
OCR MCP Server using RapidOCR.

A lightweight, STATELESS MCP server that provides OCR capabilities using RapidOCR
with ONNX Runtime. Runs on CPU, no GPU required.

IMPORTANT: This server is STATELESS (stateless_http=True).
Each request is independent - no session ID required.
This matches the pattern used by google-scraper MCP server.

NOTE: json_response is NOT set (defaults to False) because the Claude SDK
sends Accept: text/event-stream header. Setting json_response=True would
cause 406 Not Acceptable errors.

Tools:
    - ocr_from_base64: Extract text from base64-encoded image
    - ocr_from_path: Extract text from image file path
"""

import base64
import io
import logging
import os

from mcp.server.fastmcp import FastMCP
from PIL import Image

from ocr_engine import OCREngine

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Configuration
PORT = int(os.environ.get("OCR_PORT", "8084"))
HOST = os.environ.get("OCR_HOST", "0.0.0.0")

# Initialize FastMCP server - STATELESS mode (no session required)
# This matches the pattern used by google-scraper MCP server
# NOTE: Do NOT set json_response=True - the Claude SDK sends Accept: text/event-stream
mcp = FastMCP(
    "ocr-server",
    host=HOST,
    port=PORT,
    stateless_http=True,  # No session persistence - each request is independent
)

# Initialize OCR engine (singleton)
engine = OCREngine()


@mcp.tool()
def ocr_from_base64(image_base64: str) -> dict:
    """Extract text from a base64-encoded image.

    Performs OCR on a base64-encoded image and returns the extracted text.
    Supports PNG, JPEG, WebP, and other common image formats.

    Args:
        image_base64: Base64-encoded image data. Handles data URI prefix
                      (e.g., 'data:image/png;base64,...') automatically.

    Returns:
        Dict with:
        - text: All extracted text concatenated with newlines
        - blocks: List of detected text blocks with confidence and bounding box
        - error: Error message if processing failed (optional)
    """
    try:
        # Handle data URI prefix if present
        if image_base64.startswith("data:"):
            if "," in image_base64:
                image_base64 = image_base64.split(",", 1)[1]
            else:
                return {"text": "", "blocks": [], "error": "Invalid data URI format"}

        # Decode base64
        try:
            img_bytes = base64.b64decode(image_base64)
        except Exception as e:
            return {"text": "", "blocks": [], "error": f"Invalid base64: {e}"}

        # Open image
        try:
            img = Image.open(io.BytesIO(img_bytes))
        except Exception as e:
            return {"text": "", "blocks": [], "error": f"Invalid image format: {e}"}

        # Convert to RGB if necessary (OCR works better with RGB)
        if img.mode in ("RGBA", "P", "LA", "L"):
            img = img.convert("RGB")

        logger.info(f"Processing image: {img.size[0]}x{img.size[1]}, mode={img.mode}")

        # Run OCR
        result = engine.process(img)
        return result.to_dict()

    except Exception as e:
        logger.exception("Unexpected error in ocr_from_base64")
        return {"text": "", "blocks": [], "error": str(e)}


@mcp.tool()
def ocr_from_path(file_path: str) -> dict:
    """Extract text from an image file.

    Performs OCR on an image file and returns the extracted text.
    The file must be accessible from within the container.

    Args:
        file_path: Absolute path to the image file.

    Returns:
        Dict with:
        - text: All extracted text concatenated with newlines
        - blocks: List of detected text blocks with confidence and bounding box
        - error: Error message if processing failed (optional)
    """
    try:
        # Validate path
        if not file_path:
            return {"text": "", "blocks": [], "error": "File path is required"}

        if not os.path.isabs(file_path):
            return {"text": "", "blocks": [], "error": "File path must be absolute"}

        if not os.path.exists(file_path):
            return {"text": "", "blocks": [], "error": f"File not found: {file_path}"}

        if not os.path.isfile(file_path):
            return {"text": "", "blocks": [], "error": f"Not a file: {file_path}"}

        logger.info(f"Processing file: {file_path}")

        # Load image with PIL and convert to RGB for consistent handling
        # RapidOCR has issues with some image modes (e.g., palette mode 'P')
        try:
            img = Image.open(file_path)
        except Exception as e:
            return {"text": "", "blocks": [], "error": f"Failed to open image: {e}"}

        # Convert to RGB if necessary
        if img.mode in ("RGBA", "P", "LA", "L"):
            img = img.convert("RGB")

        logger.info(f"Image loaded: {img.size[0]}x{img.size[1]}, mode={img.mode}")

        # Run OCR
        result = engine.process(img)
        return result.to_dict()

    except Exception as e:
        logger.exception("Unexpected error in ocr_from_path")
        return {"text": "", "blocks": [], "error": str(e)}


def main():
    """Start the OCR MCP server."""
    logger.info(f"Starting OCR MCP Server (STATELESS) on {HOST}:{PORT}...")

    # Run with streamable-http transport
    # In stateless mode, each HTTP request creates a fresh ServerSession
    mcp.run(transport="streamable-http")


if __name__ == "__main__":
    main()
