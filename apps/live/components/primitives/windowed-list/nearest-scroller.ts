// The box a list scrolls in: its nearest ancestor that scrolls vertically and has more than it shows, else the window
// (null). The editor's panel scrolls its pane; on a phone's sheet the card, chips and pane scroll as one.
export function nearestScroller(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      node.scrollHeight > node.clientHeight + 1
    )
      return node;
  }
  return null;
}
