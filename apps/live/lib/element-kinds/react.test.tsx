// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Element } from '@livedoc/document';

let settle: { resolve: (m: unknown) => void; reject: (e: unknown) => void } | null = null;
const calls: string[] = [];
const conceptsLoader = () => {
  calls.push('concepts');
  return new Promise((resolve, reject) => (settle = { resolve, reject }));
};
vi.mock('./families', () => ({
  KIND_FAMILY_LOADERS: { concepts: conceptsLoader },
  KIND_FAMILY_IDS: ['concepts'],
}));

const { familyFace, useFailedKindFamilies, useKindFamilyReady } = await import('./react');
const { resetKindFamiliesForTests, loadKindFamily } = await import('./store');

const concept = { id: 'c', type: 'shape', shape: 'pyramid' } as Element;
const square = { id: 's', type: 'shape', shape: 'square' } as Element;

function Probe({ element }: { element: Element }) {
  return <span>{useKindFamilyReady(element) ? 'ready' : 'waiting'}</span>;
}
function Failures() {
  return <span>{useFailedKindFamilies().join(',') || 'none'}</span>;
}

afterEach(() => {
  resetKindFamiliesForTests();
  settle = null;
  calls.length = 0;
  vi.restoreAllMocks();
});

describe('useKindFamilyReady', () => {
  it('draws a base element at once, asking for nothing', () => {
    render(<Probe element={square} />);
    expect(screen.getByText('ready')).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it('holds back an element before its family, asks for it, and draws when it lands', async () => {
    render(<Probe element={concept} />);
    expect(screen.getByText('waiting')).toBeTruthy();
    expect(calls).toEqual(['concepts']);
    await act(async () => settle!.resolve({ ConceptFace: () => null }));
    expect(screen.getByText('ready')).toBeTruthy();
  });

  it('draws an element whose family is already in, in its first frame', async () => {
    const run = loadKindFamily('concepts', 'open');
    settle!.resolve({});
    await run;
    render(<Probe element={concept} />);
    expect(screen.getByText('ready')).toBeTruthy();
  });
});

describe('useFailedKindFamilies', () => {
  it('names a family whose needed load failed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Failures />);
    expect(screen.getByText('none')).toBeTruthy();
    await act(async () => {
      const run = loadKindFamily('concepts', 'element');
      settle!.reject(new Error('offline'));
      await run;
    });
    expect(screen.getByText('concepts')).toBeTruthy();
  });
});

describe('familyFace', () => {
  it('draws the family’s component, named after it', async () => {
    const Face = familyFace('concepts', 'ConceptFace') as unknown as React.FC<{
      label: string;
    }>;
    expect(Face.displayName).toBe('ConceptFace');
    const run = loadKindFamily('concepts', 'open');
    settle!.resolve({ ConceptFace: ({ label }: { label: string }) => <b>{label}</b> });
    await run;
    render(<Face label="Tiers" />);
    expect(screen.getByText('Tiers')).toBeTruthy();
  });

  it('throws KindFamilyNotLoaded drawn outside the gate', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const Face = familyFace('concepts', 'ConceptFace') as unknown as React.FC;
    expect(() => render(<Face />)).toThrow('Kind family concepts is not loaded');
  });
});
