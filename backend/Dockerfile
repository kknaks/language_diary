FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for Azure Speech SDK
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libssl-dev \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create directories for audio files
RUN mkdir -p audio_files audio_uploads

EXPOSE 8000

# Run alembic migrations then start uvicorn
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
