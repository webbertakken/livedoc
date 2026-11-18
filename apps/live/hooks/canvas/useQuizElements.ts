// The Quiz's verbs on the editor (docs/specs/012-collaboration/quiz.md): editing the question, starting, locking,
// revealing and resetting a round, and picking an answer. Their code is the collaboration panels family's
// (quiz-verbs.ts), reached through the registry at the press: a press needs a quiz on the board, drawn once it is in.
import { requireKindFamily } from '@/lib/element-kinds/store';
import type { QuizDeps, QuizVerbs } from './quiz-verbs';

// What the Edit Quiz dialog hands back.
export type QuizDraft = {
  question: string;
  options: string[];
  correct: number;
  seconds: number;
};

export function useQuizElements(deps: QuizDeps): QuizVerbs {
  const verbs = () => requireKindFamily('collab-panels').quizVerbs(deps);
  return {
    answerQuiz: (...args) => verbs().answerQuiz(...args),
    startQuiz: (...args) => verbs().startQuiz(...args),
    lockQuiz: (...args) => verbs().lockQuiz(...args),
    revealQuiz: (...args) => verbs().revealQuiz(...args),
    resetQuiz: (...args) => verbs().resetQuiz(...args),
    saveQuiz: (...args) => verbs().saveQuiz(...args),
  };
}
