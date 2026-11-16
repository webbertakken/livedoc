// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { showStart, startShown } from './start-shown';
import type { TemplateStartMode } from './start-template-items';
import { useStartFollowsMode } from './useStartFollowsMode';

// docs/specs/007-editor/start-diagramming.md "When it shows": a mode change while a start is open opens the next one.
afterEach(() => localStorage.clear());

const mount = (tabId: string, mode: TemplateStartMode | null) =>
  renderHook(
    (p: { tabId: string; mode: TemplateStartMode | null }) => useStartFollowsMode(p.tabId, p.mode),
    {
      initialProps: { tabId, mode },
    },
  );

describe('useStartFollowsMode', () => {
  it('opens the next mode’s start when the mode changes while a start is open', () => {
    showStart('t:diagram');
    const view = mount('t', 'diagram');
    view.rerender({ tabId: 't', mode: 'pages' });
    expect(startShown('t:pages')).toBe(true);
    view.rerender({ tabId: 't', mode: 'workshop' });
    expect(startShown('t:workshop')).toBe(true);
  });

  it('leaves the next start closed when the start was closed', () => {
    const view = mount('t', 'diagram');
    view.rerender({ tabId: 't', mode: 'draw' });
    expect(startShown('t:draw')).toBe(false);
  });

  it('never carries a start to another tab, nor through a tab with content', () => {
    showStart('t:diagram');
    const view = mount('t', 'diagram');
    view.rerender({ tabId: 'u', mode: 'draw' });
    expect(startShown('u:draw')).toBe(false);
    showStart('u:draw');
    view.rerender({ tabId: 'u', mode: null });
    view.rerender({ tabId: 'u', mode: 'pages' });
    expect(startShown('u:pages')).toBe(false);
  });
});
