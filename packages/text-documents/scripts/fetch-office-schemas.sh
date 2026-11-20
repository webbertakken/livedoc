#!/usr/bin/env bash
# Fetches the schemas every written office file is validated against (docs/specs/020-import-export/office-packages.md
# "Validation") and Jing, each from its publisher and pinned by its SHA-256, into a cache outside the repository:
# nothing of them is committed. Prints the cache folder. CI keeps the folder in its cache, keyed on this script, so a
# run with the cache needs no outside host.
set -euo pipefail

CACHE="${OFFICE_SCHEMAS_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/livedoc/office-schemas}"
mkdir -p "$CACHE"

fetch() {
  local url="$1" sha="$2" file="$CACHE/$3"
  if [[ ! -f "$file" ]] || ! echo "$sha  $file" | sha256sum -c --quiet - >/dev/null 2>&1; then
    # A publisher that fails for a moment (a 404 or 5xx from a cache in front of it) is asked again; one that keeps
    # failing names itself, since curl's own message leaves out the address.
    if ! curl -fsSL --retry 5 --retry-all-errors --retry-delay 3 --connect-timeout 20 -o "$file.part" "$url"; then
      echo "[office-schemas] fetch failed: $url" >&2
      rm -f "$file.part"
      exit 1
    fi
    echo "$sha  $file.part" | sha256sum -c --quiet - || { echo "[office-schemas] checksum mismatch: $url" >&2; rm -f "$file.part"; exit 1; }
    mv "$file.part" "$file"
  fi
}

ODF=https://docs.oasis-open.org/office/OpenDocument/v1.4/os/schemas
fetch "$ODF/OpenDocument-v1.4-schema.rng" 4034ec6be29205d5fc1ee5f42468ac6ef824287b3aba6d9289032af4fafbda7f odf-schema.rng
fetch "$ODF/OpenDocument-v1.4-manifest-schema.rng" f96e1fe95f4e3609717a307c28e2fe0654c890fe70ea03eb8a53caa20b684782 odf-manifest.rng
fetch https://repo1.maven.org/maven2/org/relaxng/jing/20220510/jing-20220510.jar a60eb8a56d523bce08d07b08229dde9bab1f6b07b4b9eaa853c6fe8490a76d8c jing.jar

ECMA=https://ecma-international.org/wp-content/uploads
fetch "$ECMA/ECMA-376-4_5th_edition_december_2016.zip" bd25da1109f73762356596918bf5ff8b74a1331642dba5f1c1d1dfc6bed34ecd ecma-376-4.zip
fetch "$ECMA/ECMA-376-2_5th_edition_december_2021.zip" 1d489dc491168ea1f9e9a59063acc8dd5f02b4ad1d21aa7ec19ba9a58d020c70 ecma-376-2.zip

if [[ ! -f "$CACHE/ooxml/wml.rnc" ]]; then
  rm -rf "$CACHE/ooxml" "$CACHE/opc"
  mkdir -p "$CACHE/ooxml" "$CACHE/opc"
  unzip -p "$CACHE/ecma-376-4.zip" OfficeOpenXML-RELAXNG-Transitional.zip > "$CACHE/ooxml.zip"
  unzip -oq "$CACHE/ooxml.zip" -d "$CACHE/ooxml"
  unzip -p "$CACHE/ecma-376-2.zip" OpenPackagingConventions-RELAXNG.zip > "$CACHE/opc.zip"
  unzip -oq "$CACHE/opc.zip" -d "$CACHE/opc"
  rm -f "$CACHE/ooxml.zip" "$CACHE/opc.zip"
fi

echo "$CACHE"
