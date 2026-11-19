import { describe, expect, it } from 'vitest';
import { viewProblem } from './view-check';

// A probe that cannot set a gesture up says why (docs/specs/008-canvas/canvas-performance.md "Measuring").
describe('viewProblem', () => {
  it('passes a 100% view that reads 100% with nothing being edited', () => {
    expect(viewProblem({ zoomLabel: '100%', editing: null }, '100%')).toBeNull();
  });

  it('passes a fit view at whatever zoom fits the board', () => {
    expect(viewProblem({ zoomLabel: '21%', editing: null }, 'fit')).toBeNull();
  });

  it('names a 100% view that never left the fit zoom', () => {
    expect(viewProblem({ zoomLabel: '21%', editing: null }, '100%')).toBe(
      'the 100% view reads 21%',
    );
  });

  it('names an element left in text editing, which takes every key the probe presses', () => {
    expect(viewProblem({ zoomLabel: '21%', editing: 'Sketch "v"' }, 'fit')).toBe(
      'the fit view has an element in text editing (Sketch "v")',
    );
  });

  it('names a missing zoom readout', () => {
    expect(viewProblem({ zoomLabel: null, editing: null }, '100%')).toBe(
      'the 100% view shows no zoom readout',
    );
  });
});
