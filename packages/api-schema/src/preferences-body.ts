// The cap on a preferences save (docs/specs/007-editor/user-preferences.md "It fits"): characters of the PUT body
// `{"prefs":...}`. The api refuses a longer body; the editor trims its growable lists to fit before it sends one.
// A full account measured 4,967 characters and a text document's default styles take at most 5,000 more
// (DEFAULT_STYLES_MAX_CHARS), so the cap holds both with room to spare; it still stops a runaway client.
export const PREFERENCES_BODY_MAX = 16_384;
