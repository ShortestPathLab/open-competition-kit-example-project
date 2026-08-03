# The evaluation sandbox: the Pacman harness, fixed, with nothing of the
# submission in it. A job overlays only the seven files a student may edit.
#
# Built by the runner service when it starts, from the copy of this file inlined
# into competition.config.yaml. Nothing has to be built by hand, and nothing has
# to be mounted: an edit here changes the image's name, and a changed name is a
# rebuild.
#
# Derived from the contest server's app/dockerfile.runner, with the setup work
# done at build time rather than on every job.
FROM python:3.9-slim

# gcc and the -dev headers are needed to build recordclass; slim has neither.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential gcc python3-dev libffi-dev libssl-dev git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# pyyaml is the evaluation program's, not the harness's: evaluate.py reads
# cases.yaml. The rest are what the harness itself imports.
RUN pip install --no-cache-dir --upgrade pip \
  && pip install --no-cache-dir pandas numpy scipy recordclass pyyaml

WORKDIR /runner

# `fit5047a1` is the assignment harness; master is the capture-the-flag contest.
ARG PACMAN_REF=fit5047a1
RUN git clone --depth 1 -b "${PACMAN_REF}" https://github.com/ShortestPathLab/pacman.git . \
  && rm -rf .git

# Submissions are untrusted: run as nobody, and let the caller add --network none,
# --read-only, --memory and --pids-limit on top.
RUN useradd --uid 65532 --create-home runner && chown -R runner:runner /runner
USER runner

CMD ["python3", "--version"]
