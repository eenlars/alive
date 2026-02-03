"""Tests for OCR MCP Server."""

import base64
import io
import sys
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from ocr_engine import OCREngine, OCRResult, OCRBlock


@pytest.fixture(scope="module")
def engine():
    """Shared OCR engine instance."""
    return OCREngine()


def create_test_image(text: str, width: int = 300, height: int = 60) -> Image.Image:
    """Create a test image with the given text."""
    img = Image.new("RGB", (width, height), color="white")
    draw = ImageDraw.Draw(img)
    draw.text((20, 20), text, fill="black")
    return img


def image_to_base64(img: Image.Image) -> str:
    """Convert PIL Image to base64 string."""
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    return base64.b64encode(buffer.read()).decode()


class TestOCREngine:
    """Tests for OCREngine class."""

    def test_engine_initialization(self, engine):
        """Engine should initialize without errors."""
        assert engine is not None
        assert engine._ocr is not None

    def test_process_simple_text(self, engine):
        """Should extract simple text from image."""
        img = create_test_image("Hello World")
        result = engine.process(img)

        assert isinstance(result, OCRResult)
        assert "Hello" in result.text or "World" in result.text
        assert len(result.blocks) > 0
        assert result.error is None

    def test_process_empty_image(self, engine):
        """Should handle empty images gracefully."""
        img = Image.new("RGB", (100, 100), color="white")
        result = engine.process(img)

        assert isinstance(result, OCRResult)
        assert result.text == ""
        assert result.blocks == []
        assert result.error is None

    def test_process_multiline_text(self, engine):
        """Should extract multiple lines of text."""
        img = Image.new("RGB", (300, 100), color="white")
        draw = ImageDraw.Draw(img)
        draw.text((20, 20), "Line One", fill="black")
        draw.text((20, 50), "Line Two", fill="black")

        result = engine.process(img)

        assert len(result.blocks) >= 1  # May merge or separate lines
        assert result.error is None

    def test_result_to_dict(self, engine):
        """Should convert result to dictionary correctly."""
        img = create_test_image("Test")
        result = engine.process(img)
        result_dict = result.to_dict()

        assert "text" in result_dict
        assert "blocks" in result_dict
        assert isinstance(result_dict["blocks"], list)

    def test_block_structure(self, engine):
        """Blocks should have correct structure."""
        img = create_test_image("Hello OCR")
        result = engine.process(img)

        if result.blocks:
            block = result.blocks[0]
            assert isinstance(block, OCRBlock)
            assert isinstance(block.text, str)
            assert isinstance(block.confidence, float)
            assert 0 <= block.confidence <= 1
            assert isinstance(block.box, list)
            assert len(block.box) == 4  # 4 corner points


class TestOCRFromBase64:
    """Tests for base64 decoding and processing."""

    def test_valid_base64(self, engine):
        """Should process valid base64 image."""
        img = create_test_image("Base64 Test")
        b64 = image_to_base64(img)

        # Decode and process
        img_bytes = base64.b64decode(b64)
        img_decoded = Image.open(io.BytesIO(img_bytes))
        result = engine.process(img_decoded)

        assert result.error is None
        assert len(result.text) > 0

    def test_data_uri_format(self, engine):
        """Should handle data URI prefix."""
        img = create_test_image("Data URI")
        b64 = image_to_base64(img)
        data_uri = f"data:image/png;base64,{b64}"

        # Strip prefix like the server does
        if data_uri.startswith("data:") and "," in data_uri:
            b64_clean = data_uri.split(",", 1)[1]
        else:
            b64_clean = data_uri

        img_bytes = base64.b64decode(b64_clean)
        img_decoded = Image.open(io.BytesIO(img_bytes))
        result = engine.process(img_decoded)

        assert result.error is None


class TestOCRFromPath:
    """Tests for file path processing."""

    def test_process_from_file(self, engine, tmp_path):
        """Should process image from file path."""
        img = create_test_image("File Test")
        file_path = tmp_path / "test.png"
        img.save(file_path)

        result = engine.process(str(file_path))

        assert result.error is None
        assert len(result.text) > 0


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_rgba_image(self, engine):
        """Should handle RGBA images."""
        img = Image.new("RGBA", (200, 50), color=(255, 255, 255, 255))
        draw = ImageDraw.Draw(img)
        draw.text((20, 15), "RGBA Test", fill=(0, 0, 0, 255))

        # Convert to RGB like the server does
        img_rgb = img.convert("RGB")
        result = engine.process(img_rgb)

        assert result.error is None

    def test_grayscale_image(self, engine):
        """Should handle grayscale images."""
        img = Image.new("L", (200, 50), color=255)
        draw = ImageDraw.Draw(img)
        draw.text((20, 15), "Gray Test", fill=0)

        # Convert to RGB like the server does
        img_rgb = img.convert("RGB")
        result = engine.process(img_rgb)

        assert result.error is None

    def test_small_image(self, engine):
        """Should handle very small images."""
        img = Image.new("RGB", (10, 10), color="white")
        result = engine.process(img)

        # Should not error, just return empty result
        assert result.error is None
        assert result.text == ""

    def test_large_image(self, engine):
        """Should handle larger images."""
        img = Image.new("RGB", (1920, 1080), color="white")
        draw = ImageDraw.Draw(img)
        draw.text((100, 100), "Large Image Test", fill="black")

        result = engine.process(img)

        assert result.error is None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
