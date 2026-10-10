# syntax=docker/dockerfile:1

# HealixDz AI service: FastAPI + PyTorch CPU. Build context: ai-service/.
# The weights are NOT in the image: mount their folder read-only at /models
# (AI_MODELS_DIR on the host, see docker-compose.yml).

FROM python:3.12-slim AS build
ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
ENV PATH=/opt/venv/bin:${PATH}
WORKDIR /build
COPY requirements.txt ./
# PyTorch CPU wheels come from the PyTorch index, as in requirements.in.
RUN pip install \
      -r requirements.txt \
      --index-url https://pypi.org/simple \
      --extra-index-url https://download.pytorch.org/whl/cpu

FROM python:3.12-slim AS runtime
ENV PATH=/opt/venv/bin:${PATH} \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    AI_MODELS_DIR=/models \
    AI_SERVICE_HOST=0.0.0.0 \
    AI_SERVICE_PORT=8001
RUN groupadd --system --gid 10001 aiservice \
 && useradd --system --uid 10001 --gid 10001 --no-create-home --home-dir /app aiservice
COPY --from=build /opt/venv /opt/venv
WORKDIR /app
COPY app ./app
USER 10001:10001
EXPOSE 8001
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('AI_SERVICE_PORT', '8001') + '/health', timeout=4)"]
CMD ["python", "-m", "app.main"]
