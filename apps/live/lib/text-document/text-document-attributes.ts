// A node's attributes as the live state names them, each absent (null) until set: how every node of the text
// document's schema declares the attributes the binding carries (live-editing-and-storage.md "The layout").
export const nullAttributes = (names: readonly string[]) =>
  Object.fromEntries(names.map((name) => [name, { default: null }]));
