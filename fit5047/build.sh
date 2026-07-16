#!/usr/bin/env sh

# Builds the evaluation image. Run once before starting the stack, and again
# whenever the harness or its dependencies change.
#
# The image holds the Pacman harness and nothing of any submission: a job copies
# in only the seven files a student may edit. That is what makes an edited
# pacman.py or a rewritten layout a non-issue.

set -eu

dir="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
image="${FIT5047_IMAGE:-ock-pacman-a1:dev}"

echo "Building ${image}..."
docker build -f "${dir}/pacman.dockerfile" -t "${image}" "${dir}"
echo "Built ${image}."
