// Avatar mode (docs/specs/008-canvas/avatar-mode.md, docs/specs/016-platform/web-performance.md): the walking
// characters and their art, the reaction bursts, the Avatar Pad and its arrival beams, and where fences stop a walk.
// Loaded on first use: picking Avatar, a peer's character on the board, a burst, or a board holding an Avatar Pad
// (components/canvas/avatar-mode-faces.ts); never imported statically.
export { AvatarWalker } from '@/components/canvas/AvatarWalker';
export { ReactionBurst } from '@/components/canvas/ReactionBurst';
export { AvatarPadArrivals } from '@/components/canvas/AvatarPadArrivals';
export { AvatarPadView } from '@/components/canvas/collab/AvatarPadView';
export { fenceReachFor, fenceSegments, fenceStalled, fenceStep } from '@/lib/avatar-fence';
