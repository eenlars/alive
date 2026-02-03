from fastapi import FastAPI, UploadFile, HTTPException
from fastapi.responses import Response
from rembg import remove, new_session
from PIL import Image
import io

app = FastAPI(
    title="Image Processor",
    description="Image processing microservice",
    version="0.1.0",
)

# Pre-load the model session for better performance
session = new_session("u2net")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/api/remove-background")
async def remove_background(file: UploadFile):
    """Remove background from an uploaded image."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    try:
        contents = await file.read()
        input_image = Image.open(io.BytesIO(contents))
        output_image = remove(input_image, session=session)

        output_buffer = io.BytesIO()
        output_image.save(output_buffer, format="PNG")
        output_buffer.seek(0)

        return Response(
            content=output_buffer.getvalue(),
            media_type="image/png",
            headers={"Content-Disposition": "attachment; filename=output.png"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=5012)
