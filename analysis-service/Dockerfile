FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install runtime deps from pyproject.toml
COPY pyproject.toml ./
RUN pip install --no-cache-dir \
    "fastapi>=0.115" \
    "uvicorn[standard]>=0.32" \
    "langgraph>=0.2.50" \
    "langchain-anthropic>=0.3" \
    "anthropic>=0.45" \
    "pydantic>=2.9" \
    "httpx>=0.27" \
    "python-multipart>=0.0.20" \
    "sse-starlette>=2.1"

COPY app ./app

# Cloud Run sets PORT=8080 by default.
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 1"]
