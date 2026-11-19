'use client';

import { useEffect, type ComponentProps } from 'react';
import { familyFace, useFailedKindFamilies, useKindFamilyNeeded } from '@/lib/element-kinds/react';

// Avatar mode's faces (docs/specs/016-platform/web-performance.md): its family loads on first use, so each is drawn
// only once the family is in. Picking Avatar or a peer's character asks for it (useCanvasAvatar); a burst asks for it
// as it plays; a board holding an Avatar Pad needs it by the pad's kind.

export const AvatarWalker = familyFace('avatar-mode', 'AvatarWalker');
export const AvatarPadArrivals = familyFace('avatar-mode', 'AvatarPadArrivals');
export const AvatarPadView = familyFace('avatar-mode', 'AvatarPadView');
const ReactionBurstFace = familyFace('avatar-mode', 'ReactionBurst');

/**
 * A reaction burst (docs/specs/009-elements/reaction-pad.md), played once its family is in: the first one waits for
 * it. One whose family cannot load is over at once, so it never plays late, after a retry.
 */
export function ReactionBurst(props: ComponentProps<typeof ReactionBurstFace>) {
  const ready = useKindFamilyNeeded('avatar-mode');
  const failed = useFailedKindFamilies().includes('avatar-mode');
  const { onDone } = props;
  useEffect(() => {
    if (failed && !ready) onDone();
  }, [failed, ready, onDone]);
  return ready ? <ReactionBurstFace {...props} /> : null;
}
