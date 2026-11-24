import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkSizing, formatSizingViolations } from '@livedoc/tailwind-config/sizing-guard';

const root = fileURLToPath(new URL('.', import.meta.url));

// The editor's parts that have moved to the sizing scale (docs/specs/004-interface-design/sizing.md "The guard").
const SIZED_PATHS = [
  'components/primitives',
  'app/explorer',
  'app/new',
  'components/start',
  'components/dialogs/SettingsDialog.tsx',
  'components/dialogs/settings',
  'components/dialogs/ActiveSharePass.tsx',
  'components/dialogs/CollaboratorFacilitatorButton.tsx',
  'components/dialogs/CollaboratorsDialog.tsx',
  'components/dialogs/CollaboratorsHost.tsx',
  'components/dialogs/DeleteAccountDialog.tsx',
  'components/dialogs/ExpiredSharePass.tsx',
  'components/dialogs/FocusInviteDialog.tsx',
  'components/dialogs/ShareComposer.tsx',
  'components/dialogs/ShareCopyMenu.tsx',
  'components/dialogs/share-dialog-parts.tsx',
  'components/dialogs/ShareDialog.tsx',
  'components/dialogs/ShareDialog.types.ts',
  'components/dialogs/ShareIdentity.tsx',
  'components/dialogs/ShareOfflineGate.tsx',
  'components/dialogs/SharePassTicket.tsx',
  'components/dialogs/SharePasswordGate.tsx',
  'components/dialogs/SharePasswordSection.tsx',
  'components/dialogs/ShareRolePicker.tsx',
  'components/dialogs/ShareStatus.tsx',
  'components/dialogs/TeamFormModal.tsx',
  'components/dialogs/TeamInviteLinkDialog.tsx',
  'components/dialogs/usePassExit.ts',
  'components/dialogs/DomainModelExportPanel.tsx',
  'components/dialogs/FinishTab.tsx',
  'components/dialogs/gif',
  'components/dialogs/ImageExportPanel.tsx',
  'components/dialogs/ImportImageReport.tsx',
  'components/dialogs/LooksCarousel.tsx',
  'components/dialogs/LooksHome.tsx',
  'components/dialogs/TextTab.tsx',
  'components/dialogs/SankeyFlowRow.tsx',
  'components/dialogs/SankeyFlowsDialog.tsx',
  'components/dialogs/SankeyFlowsTable.tsx',
  'components/dialogs/SankeyNodeStrip.tsx',
  'components/dialogs/SequenceDialog.tsx',
  'components/dialogs/SequenceMessageList.tsx',
  'components/dialogs/SequenceParticipantStrip.tsx',
  'components/dialogs/AssignActionAssigneePicker.tsx',
  'components/dialogs/AssignActionDialog.tsx',
  'components/dialogs/LineDataDialog.tsx',
  'components/dialogs/LinkPickerDialog.tsx',
  'components/dialogs/TabOrganiseDialogs.tsx',
  'components/panels',
  'components/canvas/ImageDropZone.tsx',
];

describe('live sizing', () => {
  it('draws every moved part from the sizing scale', () => {
    expect(formatSizingViolations(checkSizing({ root, paths: SIZED_PATHS }))).toBe('');
  });
});
