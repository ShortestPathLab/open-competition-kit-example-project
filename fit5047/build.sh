#!/usr/bin/env sh

# Builds the evaluation image, for the TypeScript runner in this directory.
#
# The competition itself no longer needs this. Its runner declares the recipe in
# competition.config.yaml and the runner service builds it on startup, naming the
# image after the contents of the Dockerfile so that an edit rebuilds. This
# script stays because the package beside it predates that and calls sandbox.run
# with a tag it expects to already exist.
#
# The image holds the Pacman harness and nothing of any submission: a job copies
# in only the seven files a student may edit. That is what makes an edited
# pacman.py or a rewritten layout a non-issue.

set -eu

dir="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
project="$(dirname -- "${dir}")"
image="${FIT5047_IMAGE:-ock-pacman-a1:dev}"

echo "Building ${image}..."
docker build -f "${project}/pacman.dockerfile" -t "${image}" "${project}"
echo "Built ${image}."
