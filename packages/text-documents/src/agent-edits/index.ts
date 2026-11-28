// An agent's changes to a text document (docs/specs/034-text-documents/agents-and-sync.md "Writing").
export { parseTextOps, TEXT_OP_USAGE } from './parse';
export {
  AGENT_TEXT_ORIGIN,
  applyTextChangeset,
  type TextChangesetApplied,
  type TextChangesetInput,
  type TextChangesetRefused,
} from './apply';
export { revertTextChangeset } from './revert';
export * from './text-ops';
