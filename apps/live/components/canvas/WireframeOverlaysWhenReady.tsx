'use client';

import { useMemo, type ComponentProps } from 'react';
import { holdsWireframePage } from '@/lib/element-kinds/kind-family-of';
import { familyFace, useKindFamilyNeeded } from '@/lib/element-kinds/react';

// A wireframe page's camera and system bars (docs/specs/007-editor/wireframe-pages.md), the wireframes family's
// (docs/specs/016-platform/web-performance.md): drawn once the family is in, which a board without a wireframe page
// never asks for. One added later (a page turned into a device, a peer's) draws when the family lands.
const WireframeDeviceOverlays = familyFace('wireframes', 'WireframeDeviceOverlays');

export function WireframeOverlaysWhenReady(props: ComponentProps<typeof WireframeDeviceOverlays>) {
  const needed = useMemo(() => holdsWireframePage(props.pages), [props.pages]);
  const ready = useKindFamilyNeeded(needed ? 'wireframes' : null);
  return needed && ready ? <WireframeDeviceOverlays {...props} /> : null;
}
