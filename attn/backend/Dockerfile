FROM python:3.14-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN pip install --no-cache-dir uv

# Copy dependency files
COPY pyproject.toml .python-version uv.lock ./

# Install dependencies
RUN uv sync --frozen

# Copy application code
COPY app ./app

# Create data directories
RUN mkdir -p /data/workspaces /data/configs /data/github/ssh /data/github/ghconfig

# Expose port
EXPOSE 8000

# Run with uv
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
