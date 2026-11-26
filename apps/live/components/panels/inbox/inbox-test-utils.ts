// Test rows for the Inbox's tests (docs/specs/013-workspace/inbox.md §1): one of each kind, each overridable.
import type {
  ActivityAction,
  ActivityCard,
  ActivityCardThread,
  ActivityFormResponses,
  ActivityThread,
} from '@livedoc/api-schema';
import type { ActivityFeed } from '@/app/explorer/useActivityFeed';

export const place = {
  documentId: 'd1',
  documentName: 'Payments',
  teamId: null,
  via: 'own' as const,
  shareCode: null,
  tabId: 't1',
  tabName: 'Flow',
  elementLabel: 'Checkout',
  anchor: 'element' as const,
};

export const action = (over: Partial<ActivityAction> = {}): ActivityAction => ({
  ...place,
  elementId: 'e-a1',
  id: 'a1',
  name: 'Write the runbook',
  description: 'Before Friday',
  assignee: { userId: 'me', name: 'Me' },
  assigner: { id: 'u-bo', name: 'Bo Larsen' },
  createdAt: 1,
  updatedAt: 3_000,
  assignedToMe: true,
  createdByMe: false,
  ...over,
});

export const card = (over: Partial<ActivityCard> = {}): ActivityCard => ({
  documentId: 'd2',
  documentName: 'Roadmap',
  teamId: null,
  via: 'own',
  shareCode: null,
  board: { tabId: 'tp', tabName: 'Plan', elementId: 'b1', title: 'Sprint 14' },
  id: 'it1',
  key: 12,
  type: 'task',
  title: 'Wire the form',
  status: 'todo',
  updatedAt: 2_000,
  ...over,
});

export const thread = (over: Partial<ActivityThread> = {}): ActivityThread => ({
  ...place,
  elementId: 'e9',
  elementLabel: 'Gateway',
  commentCount: 2,
  latest: { text: 'Any news?', authorName: 'Priya Shah', authorColor: '#336699', at: 4_000 },
  firstAt: 1,
  youCommented: false,
  onYourDocument: true,
  mentionsYou: false,
  canComment: true,
  ...over,
});

export const cardThread = (over: Partial<ActivityCardThread> = {}): ActivityCardThread => ({
  documentId: 'd2',
  documentName: 'Roadmap',
  teamId: null,
  via: 'own',
  shareCode: null,
  board: { tabId: 'tp', tabName: 'Plan', elementId: 'b1', title: 'Sprint 14' },
  id: 'it2',
  key: 7,
  type: 'task',
  title: 'Pick a font',
  commentCount: 1,
  latest: { text: 'Inter?', authorName: 'Sam', authorColor: '#aa3366', at: 1_000 },
  firstAt: 1,
  youCommented: true,
  onYourDocument: false,
  mentionsYou: false,
  ...over,
});

export const form = (over: Partial<ActivityFormResponses> = {}): ActivityFormResponses => ({
  documentId: 'd3',
  documentName: 'Intake',
  teamId: null,
  via: 'own',
  tabId: 'tf',
  heading: 'Bug Report',
  boardTabId: 'tb',
  unseen: 3,
  latestAt: 5_000,
  ...over,
});

export const feedOf = (over: Partial<ActivityFeed> = {}): ActivityFeed => ({
  assignedToMe: [],
  youAssigned: [],
  threads: [],
  formResponses: [],
  loading: false,
  error: false,
  retry: () => {},
  dismiss: () => {},
  ...over,
});
