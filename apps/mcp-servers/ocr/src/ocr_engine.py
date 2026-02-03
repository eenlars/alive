"""OCR Engine wrapper for RapidOCR."""

import logging
from dataclasses import dataclass
from typing import Any

from rapidocr_onnxruntime import RapidOCR

logger = logging.getLogger(__name__)


@dataclass
class OCRBlock:
    """A single detected text block."""
    text: str
    confidence: float
    box: list[list[float]]  # [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]


@dataclass
class OCRResult:
    """Result of OCR processing."""
    text: str
    blocks: list[OCRBlock]
    elapsed_seconds: float
    error: str | None = None

    def to_dict(self) -> dict:
        """Convert to JSON-serializable dict."""
        result = {
            "text": self.text,
            "blocks": [
                {
                    "text": b.text,
                    "confidence": b.confidence,
                    "box": b.box
                }
                for b in self.blocks
            ]
        }
        if self.error:
            result["error"] = self.error
        return result


class OCREngine:
    """Wrapper around RapidOCR for cleaner interface."""

    def __init__(self):
        logger.info("Initializing RapidOCR engine...")
        self._ocr = RapidOCR()
        logger.info("RapidOCR engine ready")

    def process(self, image: Any) -> OCRResult:
        """Process an image and return OCR results.

        Args:
            image: PIL Image, numpy array, or file path

        Returns:
            OCRResult with extracted text and blocks
        """
        try:
            raw_result, elapsed_list = self._ocr(image)
            total_elapsed = sum(elapsed_list) if elapsed_list else 0

            if not raw_result:
                logger.info(f"No text found in image (elapsed: {total_elapsed:.2f}s)")
                return OCRResult(text="", blocks=[], elapsed_seconds=total_elapsed)

            blocks = []
            lines = []

            for item in raw_result:
                box = item[0]
                text = item[1]
                confidence = item[2]

                block = OCRBlock(
                    text=text,
                    confidence=round(float(confidence), 3),
                    box=[[float(p[0]), float(p[1])] for p in box]
                )
                blocks.append(block)
                lines.append(text)

            logger.info(f"OCR completed: {len(blocks)} blocks in {total_elapsed:.2f}s")

            return OCRResult(
                text="\n".join(lines),
                blocks=blocks,
                elapsed_seconds=total_elapsed
            )

        except Exception as e:
            logger.error(f"OCR processing error: {e}")
            return OCRResult(
                text="",
                blocks=[],
                elapsed_seconds=0,
                error=str(e)
            )
