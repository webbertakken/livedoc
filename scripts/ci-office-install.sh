#!/usr/bin/env bash
# LibreOffice's Writer and Calc, Java and unzip for CI's Office files job (docs/specs/020-import-export/office-packages.md
# "Validation"), installed from the .deb files kept in the cache folder given ($1). With the folder full, nothing is
# fetched: the Ubuntu mirrors are reached only when the package list or the image changes and the cache is empty.
# Every part prints its progress and how long it took, so a stall shows where it is.
set -euo pipefail

DEBS="${1:?usage: ci-office-install.sh <deb cache folder>}"
# The list the cache key hashes (this file): change it, and the next run fetches afresh.
PACKAGES=(libreoffice-writer-nogui libreoffice-calc-nogui default-jre-headless unzip)
# A stalled mirror connection is dropped after 30 s and tried again, rather than holding the job to its limit.
APT=(-o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 -o Dpkg::Use-Pty=0)
export DEBIAN_FRONTEND=noninteractive

part() {
  local name=$1 started=$SECONDS
  shift
  echo "::group::${name}"
  "$@"
  echo "::endgroup::"
  echo "[office-install] ${name}: $((SECONDS - started)) s"
}

if compgen -G "${DEBS}/*.deb" > /dev/null; then
  echo "[office-install] $(ls "${DEBS}"/*.deb | wc -l) cached packages: no download"
else
  mkdir -p "${DEBS}/partial"
  part "Read the package lists" apt-get "${APT[@]}" update
  part "Download ${PACKAGES[*]}" \
    apt-get "${APT[@]}" install -y --no-install-recommends --download-only \
    -o Dir::Cache::Archives="${DEBS}" "${PACKAGES[@]}"
  rm -rf "${DEBS}/partial" "${DEBS}/lock"
fi

# One dpkg call over every file unpacks them all before configuring any, so their order does not matter.
part "Install the packages" dpkg -i "${DEBS}"/*.deb
part "Check LibreOffice and Java" bash -c 'soffice --version && java -version'
