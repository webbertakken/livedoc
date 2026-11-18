import { afterEach, describe, expect, it, vi } from 'vitest';
import { createShape } from '@livedoc/document';
import { loadEveryKindFamily } from '@/lib/element-kinds/load-every-family';
import { KindFamilyNotLoaded, resetKindFamiliesForTests } from '@/lib/element-kinds/store';
import { useQuizElements } from './useQuizElements';

// docs/specs/016-platform/web-performance.md: the Quiz's verbs are the collaboration panels family's code, reached at
// the press.
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

const deps = () => ({
  activeId: 't1',
  commitTabs: vi.fn(),
  applyElementDelta: vi.fn(),
  patchAsFacilitator: vi.fn(),
  editsBlocked: false,
  sessionToolsBlocked: false,
  selfParticipant: { id: 'me', name: 'Me', colour: '#000000' } as never,
});

afterEach(() => resetKindFamiliesForTests());

describe('useQuizElements', () => {
  it('reaches its verbs through the family at the press', async () => {
    await loadEveryKindFamily();
    const d = deps();
    const quiz = createShape('quiz', 0, 0);
    useQuizElements(d).lockQuiz(quiz);
    expect(d.patchAsFacilitator).toHaveBeenCalledWith(quiz.id, expect.any(Function));
  });

  it('names the family when a press comes before it is in', () => {
    const quiz = createShape('quiz', 0, 0);
    expect(() => useQuizElements(deps()).lockQuiz(quiz)).toThrow(KindFamilyNotLoaded);
  });
});
