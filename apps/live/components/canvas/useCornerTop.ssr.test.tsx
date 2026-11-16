// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { useCornerTop } from './useCornerTop';

function Probe() {
  return <i>{useCornerTop()}</i>;
}

describe('useCornerTop on the server', () => {
  it('is 64 px with no window to measure', () => {
    expect(renderToString(<Probe />)).toContain('64');
  });
});
