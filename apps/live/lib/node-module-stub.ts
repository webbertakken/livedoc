// What a browser bundle gets for Node's `module`: nothing. HarfBuzz's Emscripten glue (harfbuzzjs, the mark faces'
// shaper in the PDF engine's worker) imports it only when it runs under Node, which a browser never is.
export {};
