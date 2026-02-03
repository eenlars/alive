FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the model
RUN python -c "from rembg import new_session; new_session('u2net')"

COPY . .

EXPOSE 5012

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5012"]
