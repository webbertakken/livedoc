// What one file read makes at most (docs/specs/029-sheets/files-and-print.md "Limits", "Import security"), however few
// bytes repeat it: past it the read cuts, and names the cut.

/**
 * Cells one file makes (D121): two million repeated cells take about 550 MB through the read, the sheets made and
 * their parts (measured in Node), so a file of a few hundred bytes cannot exhaust the page. Safe range 1,000,000 to
 * 4,000,000.
 */
export const FILE_READ_CELLS_MAX = 2_000_000;
