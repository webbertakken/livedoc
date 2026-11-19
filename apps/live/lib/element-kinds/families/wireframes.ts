// The wireframes family (docs/specs/016-platform/web-performance.md): a wireframe page drawn as a device. Its camera
// and system bars over the screen (WireframeDeviceOverlays) and the frame's drawing (wireframe-frame.ts and
// wireframe-device-svg.ts in @livedoc/document). Loaded through the registry (lib/element-kinds) for a tab with a
// wireframe page, never imported statically; a device's geometry, its screen and safe area, and its frame's colours
// stay base.
export { WireframeDeviceOverlays } from '@/components/canvas/WireframeDeviceOverlays';
export { wireframeFrameSvg } from '@livedoc/document';
