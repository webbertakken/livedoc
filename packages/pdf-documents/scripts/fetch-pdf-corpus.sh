#!/usr/bin/env bash
# Fetches the wider PDF corpus and the second renderer its pages are compared with
# (docs/research/pdf-documents/corpus-and-validators.md "Licences, and what may live in the repository", "Validators
# and oracles"): other projects' test files under terms the repository does not take in, each from its project at a
# pinned commit, and PDF.js with the canvas it draws on in Node, each from the npm registry; every file held to its
# SHA-256, in a cache outside the repository: nothing of them is committed. Prints the cache folder. CI keeps the
# folder in its cache, keyed on this script, so a run with the cache needs no outside host. Read by
# src/validation/corpus.validate.ts, whose expectations of each file are corpus/fetched.json.
set -euo pipefail

CACHE="${PDF_CORPUS_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/livedoc/pdf-corpus}"
mkdir -p "$CACHE"

# fetch <sha256> <group/file> <url>: a file already there with the pinned bytes is not asked for again. A host that
# fails for a moment is asked again; a failure names its address, since curl's own message leaves it out.
fetch() {
  local sha="$1" file="$CACHE/$2" url="$3"
  if [[ -f "$file" ]] && echo "$sha  $file" | sha256sum -c --quiet - >/dev/null 2>&1; then return; fi
  mkdir -p "$(dirname "$file")"
  if ! curl -fsSL --retry 5 --retry-all-errors --retry-delay 3 --connect-timeout 20 -o "$file.part" "$url"; then
    echo "[pdf-corpus] fetch failed: $url" >&2
  elif ! echo "$sha  $file.part" | sha256sum -c --quiet - >/dev/null 2>&1; then
    echo "[pdf-corpus] checksum mismatch: $url" >&2
  else
    mv "$file.part" "$file"
    return
  fi
  rm -f "$file.part"
  echo "[pdf-corpus] no address gave $2" >&2
  exit 1
}

# pdf.js's test/pdfs: the repository is Apache-2.0, and many of its files are third parties' documents.
PDFJS=https://raw.githubusercontent.com/mozilla/pdf.js/bfbade6b6d30d7e15069163a31c385f7553689ea/test/pdfs
# The PDF Association's PDF 2.0 examples: CC BY-SA 4.0, share-alike, so never in an MIT repository.
PDF20=https://raw.githubusercontent.com/pdf-association/pdf20examples/c20f2c17bfcc4baab7cfe62e70fae64caf14d5fa
# Left out for its size, since the cache is restored on every run: pdf.js's 22060_A1_01_Plans.pdf (6.3 MB of vector
# plans on one page).

fetch 3662ff519e485810520552bf301d8c3b2b917fd2f83303f4965d7abed367e113 text/tracemonkey.pdf "$PDFJS/tracemonkey.pdf"
fetch a6db6d2f5e4f97e1e28a5919a875a40b89e38d0229b33cc023ca4d353f3ab3ec text/TAMReview.pdf "$PDFJS/TAMReview.pdf"
fetch 753441c619c529c8d0fc3e7e470f07c9547838fc7229bea8c1dcf854acee03b4 text/freeculture.pdf "$PDFJS/freeculture.pdf"
fetch 4a10e1aee6565b5f329f073470cf95410272412510985948dc86399b57d7b4db text/pdfjs_wikipedia.pdf "$PDFJS/pdfjs_wikipedia.pdf"
fetch 04f17b84112d8130d75601f8f9c2027481a19df595aacb753ca3f9f3b08b2350 text/mixedfonts.pdf "$PDFJS/mixedfonts.pdf"
fetch 4d48fc12e619a823bf70b3a4d8e9d916a85683ecb176d138af66a57351bd21f9 text/standard_fonts.pdf "$PDFJS/standard_fonts.pdf"
fetch 234c0ab8e9458f4d17133b08d2b66170eeb92be2a80e1508aa5117a2bf568f63 text/alphatrans.pdf "$PDFJS/alphatrans.pdf"

fetch 1cad1de912ba29f89a6d8b08bc5b0f84382874ffedab2c8f9e05ef608c265bb1 scripts/ArabicCIDTrueType.pdf "$PDFJS/ArabicCIDTrueType.pdf"
fetch 752304c24a50834d111793fc038cafc892c071d04f214072729c41a178c161e7 scripts/ThuluthFeatures.pdf "$PDFJS/ThuluthFeatures.pdf"
fetch 049a4330710d8470896061acf7ee486735e94cef2769f6cc13fec3cb13bb65aa scripts/arial_unicode_ab_cidfont.pdf "$PDFJS/arial_unicode_ab_cidfont.pdf"
fetch 3a6948ca33558a0f1c9dabf70902e14e263e814b6a12da44ba8ec9439c0bafdd scripts/copy_paste_ligatures.pdf "$PDFJS/copy_paste_ligatures.pdf"
fetch 514511143db12309893fb69cdf98c76f2361c20da394f79fdff2c119ed7a4393 scripts/vertical.pdf "$PDFJS/vertical.pdf"
fetch 8ac40dc49d40af8b5a50b442ced56b8db962c961a779a0284cd3a6207adc0bb7 scripts/Type3WordSpacing.pdf "$PDFJS/Type3WordSpacing.pdf"

fetch 72b6387356ccfdfb95a0a5eff5e1ceb9b7667019807d7b04abaf64dad7ea143a marks/annotation-highlight.pdf "$PDFJS/annotation-highlight.pdf"
fetch ef04b7049d5cab49c702887c423f20cfecf76d36905772209cc6781425d8f671 marks/annotation-underline.pdf "$PDFJS/annotation-underline.pdf"
fetch ca7225dbdc6f8a26814cf0d67f5c509589e2cc09ace6bdb04a375a266db5b708 marks/annotation-strikeout.pdf "$PDFJS/annotation-strikeout.pdf"
fetch 95a2af9d01c2e532711a1483d58a258e469f3ff0e7dd1c2ae45c70bd8f9bb6e8 marks/annotation-squiggly.pdf "$PDFJS/annotation-squiggly.pdf"
fetch 318ed4bead93fa6ff023571b17ddca41e82fe2347b497ea24903a11e1892fb71 marks/annotation-freetext.pdf "$PDFJS/annotation-freetext.pdf"
fetch afdc6fb72e8dcb8f0796a48388fc011e9db212e18d1d7b8cf95b327e88cf6ce9 marks/annotation-caret-ink.pdf "$PDFJS/annotation-caret-ink.pdf"
fetch 76d566c092c23ccbec4bb488c40dc6daec8a381cb5386452b186728652436704 marks/annotation-stamp.pdf "$PDFJS/annotation-stamp.pdf"
fetch cea9ed8cf5726fa643da0c083bc8db8df790ab5e7ee9a2b62224aab73d9fa742 marks/annotation-line.pdf "$PDFJS/annotation-line.pdf"
fetch 88ed9ed813c3585b3098b9f4eef5107426f7829044117cd87f77bdc38a8e3f72 marks/annotation-square-circle.pdf "$PDFJS/annotation-square-circle.pdf"
fetch 06917202feda6b6bb8b57b048655f946f749bdff5a8bfcb35eb0116f38910312 marks/annotation-link-text-popup.pdf "$PDFJS/annotation-link-text-popup.pdf"
fetch b2f3751cd63e2402d95673f763e52fb105e6ce8e0b41406ca6d9965f5c894d43 marks/annotation-fileattachment.pdf "$PDFJS/annotation-fileattachment.pdf"
fetch 283b215db9937fcdf148b22e7310892d148e43047bccffa6bf56eb4156592e5d marks/comments.pdf "$PDFJS/comments.pdf"
fetch 025a8235824da8fdc2a73503d78ec0a658eb9f6620380108807e27013ae3a07d marks/highlights.pdf "$PDFJS/highlights.pdf"
fetch c3d4d2c0f75d99e297d32713303f52b099f34bba642c1a10b0c95819aa5f10f6 marks/multimedia_annotations.pdf "$PDFJS/multimedia_annotations.pdf"

fetch 9f091ceb368ad0406094efaa6c50d5033735ee52f383e0973dc53a7467089d7c fields/annotation-text-widget.pdf "$PDFJS/annotation-text-widget.pdf"
fetch 2fcab2aed82afe9775359c1d166fb7aae77e99d25fe03be177e233d02d572538 fields/annotation-choice-widget.pdf "$PDFJS/annotation-choice-widget.pdf"
fetch f7b1c9c7b2ecb909f6b168cc1b137230076533f977a205472b212b7f0d3a78d7 fields/annotation-button-widget.pdf "$PDFJS/annotation-button-widget.pdf"
fetch 899edb271684d2451337e225268003324a583a7d3429e23efd69f1654adf9bf9 fields/prefilled_f1040.pdf "$PDFJS/prefilled_f1040.pdf"
fetch f41f0818365ffd14ca4e55c0556355193bd76632b970d60cc2dec554cac6f379 fields/160F-2019.pdf "$PDFJS/160F-2019.pdf"
fetch 4679ee03ee84b48d8b67ba39975e946de49216ba744a729fa30ef8f32c3ea9ba fields/js-buttons.pdf "$PDFJS/js-buttons.pdf"
fetch dad709ec8c7197fee70bcf053dcf8609d4f05e1830c96c4af51c85e83957c995 fields/evaljs.pdf "$PDFJS/evaljs.pdf"
fetch bb8443ede056964948657153c44ce5e82a9fe231ad3aa2abf6849c956e82da27 fields/resetform.pdf "$PDFJS/resetform.pdf"
fetch 6d7c608d0102fa1e1b3cbc2c3b0a989783e90f84ff1a7fe7cbdb6dc2a1b60fbd fields/form_two_pages.pdf "$PDFJS/form_two_pages.pdf"

fetch 8313c52ea97b49908137fd744e85fc37584b502210fcc0a73d6c272cca9d7889 xfa/xfa_filled_imm1344e.pdf "$PDFJS/xfa_filled_imm1344e.pdf"
fetch d039a40ea28384bae8d1a24929a4288aae1aeb433c441fd39c04fad618fa6f19 xfa/xfa_issue14315.pdf "$PDFJS/xfa_issue14315.pdf"

fetch 35730b8e3ad3873ccc70067a4688b08dde6240ff0d9db94e7f38dabeb6d748d7 tagged/tracemonkey_a11y.pdf "$PDFJS/tracemonkey_a11y.pdf"
fetch 5b5510bb5f91c86aa0bbd4882842d4583c814e0e69a0cfbff0e70dc250a8d0f3 tagged/structure_simple.pdf "$PDFJS/structure_simple.pdf"

fetch 659d6b19912f63db988b0b26b9bde0e6d8100667ef162051a4a84ea8e5b90272 pictures/cmykjpeg.pdf "$PDFJS/cmykjpeg.pdf"
fetch 39ce34c2d32738c7c94970fd76559ecb9efd671f5ab99e515a853674e7a824ce pictures/blendmode.pdf "$PDFJS/blendmode.pdf"
fetch 0f8479d461d0d7e5fb3875f8336ecbbc995ec180bc60b07a7a8be757a9e22169 pictures/perf_codecs_jpx.pdf "$PDFJS/perf_codecs_jpx.pdf"
fetch 8b262e6df39f1d66151830911b1371ccdb98cedc53b50589a209143293c98221 pictures/perf_codecs_ccitt.pdf "$PDFJS/perf_codecs_ccitt.pdf"
fetch 6acc9ef1309d383a5deb2dbccab560b0855d0b53234d1f38853796ba0d603ccc pictures/perf_transparency_blend_modes.pdf "$PDFJS/perf_transparency_blend_modes.pdf"
fetch 3c6dfd684e8f2c98602ee87f335714de52c02bf1b3a8f74f61e7a7be49a952b8 pictures/perf_shadings_axial_radial.pdf "$PDFJS/perf_shadings_axial_radial.pdf"
fetch 89edde6d2acdee4fac1774cb17e457897a16f24e46e99b2fde9477952d202abb pictures/perf_structure_optional_content.pdf "$PDFJS/perf_structure_optional_content.pdf"
fetch 88d7f8b3f6e8cb26fdde69bbcd27990f2f61f807472afce7b5dbe2ae8f4f3ff7 pictures/Brotli-Prototype-FileA.pdf "$PDFJS/Brotli-Prototype-FileA.pdf"

fetch 3fabd640596805188db89117c50613e1897502329ac16ac4cab8a1049fb86ad8 scans/perf_images_scan_bilevel.pdf "$PDFJS/perf_images_scan_bilevel.pdf"
fetch a2404eebb2dd6f7451009dc8034e0236c03db43d36c5f49f916d0a67257e39e8 scans/perf_images_scan_gray.pdf "$PDFJS/perf_images_scan_gray.pdf"

fetch a33bc9ff49df11644e5790add536df87b702684b729999539df32ae655fd6dd1 damaged/bomb_giant.pdf "$PDFJS/bomb_giant.pdf"
fetch 1c780335b494ac52eae9fa4d05f1bba88c18ca6b24e6e302b9f271de05e256aa damaged/PDFBOX-3148-2-fuzzed.pdf "$PDFJS/PDFBOX-3148-2-fuzzed.pdf"
fetch 233c39dc16ed862911668784739d07dc9a27ae844d63188de7019da4f012f942 damaged/poppler-90-0-fuzzed.pdf "$PDFJS/poppler-90-0-fuzzed.pdf"
fetch d40f31f182cf254ab134826d379875acacb1f7b48bf1a57bce2e30b38d16628e damaged/scan-bad.pdf "$PDFJS/scan-bad.pdf"

fetch 11d268780724faf63110612a4625923420d2f60075c07d5365d2c9197d1c04cd structure/outlines_se.pdf "$PDFJS/outlines_se.pdf"
fetch 9acec9f83f1557183c83a87111b85141e657849ac2aa92864ffd63cc91572379 structure/attachment.pdf "$PDFJS/attachment.pdf"
fetch 0f44da5152adf8cafcd7b0057d840310d78e17d033ee5414da0881b6dcd130ab structure/encrypted-attachment.pdf "$PDFJS/encrypted-attachment.pdf"

fetch 1fe9051d9ac1f39828988040db471916251dc2953c1a32efd6596e4975da848c signed/signed_verified.pdf "$PDFJS/signed_verified.pdf"

fetch 296d2a0b2ce19b606f29265694f194a754fbc61783982b5b8d730e8637482236 pdf20/Simple_PDF_2.0_file.pdf "$PDF20/Simple%20PDF%202.0%20file.pdf"
fetch f3a018213564a420db81062a0e584fbcc5f705e353ed477da43bab6222f137b6 pdf20/PDF_2.0_UTF-8_string_and_annotation.pdf "$PDF20/PDF%202.0%20UTF-8%20string%20and%20annotation.pdf"
fetch 9b25d59d07034634a990e79db6ef82b9f86769d9b94d8d8635f20d06aaec9d18 pdf20/PDF_2.0_via_incremental_save.pdf "$PDF20/PDF%202.0%20via%20incremental%20save.pdf"
fetch a5b92313770f16ba1db649ccdc97d42f7744659c691897538734eebdc1bc9e9a pdf20/PDF_2.0_with_offset_start.pdf "$PDF20/PDF%202.0%20with%20offset%20start.pdf"
fetch 7c13afe3078a4c202184edce3169f7bc842c8fd3db9da7140af6bc0b3b2fa44a pdf20/PDF_2.0_with_page_level_output_intent.pdf "$PDF20/PDF%202.0%20with%20page%20level%20output%20intent.pdf"
fetch a7ca717ef062df0a65e58487d26358c81424b76084a2000ca1c74b9e5776b7a1 pdf20/pdf20-utf8-test.pdf "$PDF20/pdf20-utf8-test.pdf"

# The second renderer: PDF.js (Apache-2.0) and the canvas it draws on outside a browser (MIT, Skia). A tool of the
# validation, as qpdf is, and never a dependency of the workspace: a canvas package anywhere in the workspace is
# picked up by jsdom, and every app's tests would then run against a real canvas. The canvas is the build for Linux
# on x64 with glibc, CI's machine: elsewhere the render comparison says so and stops.
NPM=https://registry.npmjs.org
fetch 7461aefcd27c4ef0dd76f9ca5760f09466eb6b3f934432670c12132e7b3d6faa oracle/pdfjs-dist.tgz "$NPM/pdfjs-dist/-/pdfjs-dist-6.5.438.tgz"
fetch 79830d3e0655d4000afb35d8cec26e5fcc0f02699dceb01c6f507188ff00edcc oracle/canvas.tgz "$NPM/@napi-rs/canvas/-/canvas-1.1.1.tgz"
fetch 0b6dee41dc203fe96614b72066da90278eef921780a32478ee3a6754ce18c87f oracle/canvas-linux-x64-gnu.tgz \
  "$NPM/@napi-rs/canvas-linux-x64-gnu/-/canvas-linux-x64-gnu-1.1.1.tgz"

# Unpacked as the packages they are, so each finds the other by its name. The stamp names what was unpacked: a
# change of version above unpacks anew.
MODULES="$CACHE/oracle/node_modules"
STAMP="pdfjs-dist@6.5.438 canvas@1.1.1"
if [[ "$(cat "$MODULES/.unpacked" 2>/dev/null)" != "$STAMP" ]]; then
  rm -rf "$MODULES"
  unpack() {
    mkdir -p "$MODULES/$2"
    tar -xzf "$CACHE/oracle/$1" -C "$MODULES/$2" --strip-components=1
  }
  unpack pdfjs-dist.tgz pdfjs-dist
  unpack canvas.tgz @napi-rs/canvas
  unpack canvas-linux-x64-gnu.tgz @napi-rs/canvas-linux-x64-gnu
  echo "$STAMP" > "$MODULES/.unpacked"
fi

echo "$CACHE"
