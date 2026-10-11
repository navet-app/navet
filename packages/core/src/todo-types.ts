import type { IntegrationProviderId } from './integration-providers';

export interface NavetTodoList {
  id: string;
  providerId: IntegrationProviderId;
  externalId: string;
  /** Ephemeral authenticated-session identity; never persist with a list selection. */
  sessionKey?: string;
  name: string;
  available: boolean;
  capabilities: {
    add: boolean;
    update: boolean;
    remove: boolean;
    description: boolean;
    dueDate: boolean;
    dueDateTime: boolean;
  };
}

export interface NavetTodoItem {
  uid: string;
  summary: string;
  completed: boolean;
  /** False when this item cannot be removed even if the list supports removal. */
  removable?: boolean;
  description?: string;
  dueDate?: string;
  dueDateTime?: string;
}

export interface NavetTodoItemInput {
  summary: string;
  description?: string | null;
  dueDate?: string | null;
  dueDateTime?: string | null;
}

export type NavetTodoItemUpdate = Partial<NavetTodoItemInput> & { completed?: boolean };
