export interface SessionData {
  id?: string;
  timestamp: string;
  prompts: Prompt[];
  changes: FileChange[];
  thoughts?: ThoughtBlock[];
  message?: string;
  metadata?: {
    claudeVersion?: string;
    platform?: string;
    workingDirectory?: string;
  };
}

export interface Prompt {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  associatedFiles?: string[];
}

export interface FileChange {
  type: 'create' | 'edit' | 'delete';
  path: string;
  content?: string;
  oldContent?: string;
  timestamp: string;
}

export interface ThoughtBlock {
  content: string;
  timestamp: string;
}

export interface ShareResponse {
  url: string;
  shareId: string;
  expiresAt?: string;
}