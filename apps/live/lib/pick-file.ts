// The browser's file chooser, for one file. It always settles: browsers that fire no `cancel` when the chooser is
// left say nothing at all, so a chooser left is also read from the window taking focus again with no `change` after
// it. Without that a caller waiting on the choice would wait for ever.

/** `change` fires just after focus returns when a file was chosen; past this with none, the chooser was left. */
export const PICK_CANCEL_GRACE_MS = 500;

/** Opens the chooser narrowed to `accept`; the chosen file, or null when the chooser is left. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;

    let settled = false;
    // Set the moment `change` fires, so the focus check below never reads a slow choice as none.
    let picked = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onFocus);
      resolve(file);
    };

    function onFocus() {
      window.removeEventListener('focus', onFocus);
      window.setTimeout(() => {
        if (!picked) finish(null);
      }, PICK_CANCEL_GRACE_MS);
    }

    input.onchange = () => {
      const file = input.files?.[0] ?? null;
      picked = file !== null;
      finish(file);
    };
    input.oncancel = () => finish(null);

    window.addEventListener('focus', onFocus);
    input.click();
  });
}
