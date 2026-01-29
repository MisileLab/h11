FROM ghcr.io/astral-sh/uv:python3.12-bookworm

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY worker/requirements.txt ./requirements.txt
RUN uv pip install --system -r requirements.txt

COPY api/app app
COPY worker/worker.py .

ENV PYTHONUNBUFFERED=1

CMD ["python", "worker.py"]
