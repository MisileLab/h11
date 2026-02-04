FROM python:3.14-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    wget \
    gnupg \
    ca-certificates \
    supervisor \
    # X server and window manager
    xvfb \
    x11vnc \
    fluxbox \
    # noVNC
    websockify \
    python3-numpy \
    # SSH
    openssh-client \
    # Build tools
    build-essential \
    # Terminal multiplexer
    tmux \
    # Debugging tools
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# TODO: Replace with actual OpenCode installation command
RUN pip install --no-cache-dir git+https://github.com/ohmyopencode/opencode.git || \
    echo "WARNING: OpenCode installation failed - install manually in workspace"

# Install noVNC
WORKDIR /opt
RUN git clone --depth 1 https://github.com/novnc/noVNC.git /opt/novnc \
    && git clone --depth 1 https://github.com/novnc/websockify /opt/novnc/utils/websockify \
    && ln -s /opt/novnc/vnc.html /opt/novnc/index.html

# Setup SSH directory
RUN mkdir -p /root/.ssh && chmod 700 /root/.ssh

# Setup supervisor
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Create workspace directory
WORKDIR /workspace
RUN mkdir -p /workspace/artifacts

# Expose noVNC port
EXPOSE 6080

# Set environment
ENV DISPLAY=:99

# Start supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
