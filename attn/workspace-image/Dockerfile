FROM ghcr.io/astral-sh/uv:python3.14-bookworm

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:99

RUN apt-get update && apt-get install -y \
    git \
    curl \
    xvfb \
    fluxbox \
    x11vnc \
    supervisor \
    wget \
    && rm -rf /var/lib/apt/lists/*

RUN curl -sS https://webi.sh/gh | sh
ENV PATH="/root/.local/bin:${PATH}"

RUN git clone --depth 1 https://github.com/novnc/noVNC.git /opt/novnc && \
    git clone --depth 1 https://github.com/novnc/websockify.git /opt/novnc/utils/websockify

COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

WORKDIR /workspace

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/supervisord.conf"]
