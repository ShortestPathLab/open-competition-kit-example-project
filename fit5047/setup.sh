#!/usr/bin/env sh

set -eu

# ---- Config ----
WORKDIR="/runner"
BRANCH="fit5047a1"
REPO="https://github.com/ShortestPathLab/pacman.git"

mkdir -p "$WORKDIR"
cd "$WORKDIR"

echo "Working directory: $WORKDIR"

# ---- System dependencies (Linux only) ----
if command -v apt-get >/dev/null 2>&1; then
  echo "Installing system packages via apt-get..."
  apt-get update
  apt-get install -y \
    apt-utils \
    build-essential \
    gcc \
    python3-dev \
    libffi-dev \
    libssl-dev \
    curl \
    git
else
  echo "apt-get not found. Please install system dependencies manually."
fi

# ---- Install uv ----
if ! command -v uv >/dev/null 2>&1; then
  echo "Installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi

# Ensure uv is in PATH for this session
export PATH="$HOME/.local/bin:$PATH"

# ---- Install Python 3.9 via uv ----
echo "Installing Python 3.9 via uv..."
uv python install 3.9

# ---- Create virtual environment with uv ----
echo "Creating virtual environment..."
uv venv --python 3.9 --clear

# Activate venv
. .venv/bin/activate

# ---- Upgrade pip (optional, uv already handles most cases) ----
uv pip install --upgrade pip

# ---- Install dependencies ----
uv pip install pandas numpy scipy recordclass

# ---- Clone repository ----
if [ -d "pacman" ]; then
  echo "Repo already exists, pulling latest..."
  cd pacman
  git fetch origin
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
  cd ..
else
  git clone -b "$BRANCH" "$REPO" pacman
fi

echo "Setup complete."
echo "Virtual environment created with uv at: $WORKDIR/.venv"
echo "Repo available at: $WORKDIR/pacman"

# ---- Keep shell alive (Docker-like behaviour) ----
exec "$SHELL"