import fs from 'fs/promises';
import path from 'path';
import { SessionData, Prompt, FileChange, ThoughtBlock } from './types.js';

export async function captureSession(sessionPath?: string): Promise<SessionData> {
  const defaultPaths = [
    path.join(process.env.HOME || '', '.claude', 'sessions', 'latest.json'),
    path.join(process.env.HOME || '', '.claude-code', 'sessions', 'current.json'),
    path.join(process.cwd(), '.claude-session.json')
  ];
  
  let sessionFile: string | undefined = sessionPath;
  
  if (!sessionFile) {
    for (const possiblePath of defaultPaths) {
      try {
        await fs.access(possiblePath);
        sessionFile = possiblePath;
        break;
      } catch {
        continue;
      }
    }
  }
  
  if (!sessionFile) {
    throw new Error('Could not find Claude Code session file. Please specify the path with -f option.');
  }
  
  try {
    const rawData = await fs.readFile(sessionFile, 'utf-8');
    const sessionData = parseSessionData(rawData);
    return sessionData;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`Session file not found at: ${sessionFile}`);
    }
    throw new Error(`Failed to read session file: ${error.message}`);
  }
}

function parseSessionData(rawData: string): SessionData {
  try {
    const data = JSON.parse(rawData);
    
    const sessionData: SessionData = {
      timestamp: new Date().toISOString(),
      prompts: [],
      changes: [],
      thoughts: [],
      metadata: {
        claudeVersion: data.claudeVersion || 'unknown',
        platform: process.platform,
        workingDirectory: process.cwd()
      }
    };
    
    // Extract prompts from conversation
    if (data.messages && Array.isArray(data.messages)) {
      sessionData.prompts = data.messages.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp || new Date().toISOString()
      }));
    }
    
    // Extract file changes
    if (data.fileChanges && Array.isArray(data.fileChanges)) {
      sessionData.changes = data.fileChanges.map((change: any) => ({
        type: change.type,
        path: change.path,
        content: change.content,
        oldContent: change.oldContent,
        timestamp: change.timestamp || new Date().toISOString()
      }));
    }
    
    // Extract thought blocks if available
    if (data.thoughts && Array.isArray(data.thoughts)) {
      sessionData.thoughts = data.thoughts.map((thought: any) => ({
        content: thought.content,
        timestamp: thought.timestamp || new Date().toISOString()
      }));
    }
    
    return sessionData;
  } catch (error) {
    // If parsing fails, try to extract data from raw conversation format
    return parseRawConversation(rawData);
  }
}

function parseRawConversation(rawData: string): SessionData {
  const sessionData: SessionData = {
    timestamp: new Date().toISOString(),
    prompts: [],
    changes: [],
    metadata: {
      platform: process.platform,
      workingDirectory: process.cwd()
    }
  };
  
  // Simple pattern matching for conversation format
  const lines = rawData.split('\n');
  let currentRole: 'user' | 'assistant' = 'user';
  let currentContent = '';
  
  for (const line of lines) {
    if (line.startsWith('Human:') || line.startsWith('User:')) {
      if (currentContent) {
        sessionData.prompts.push({
          role: currentRole,
          content: currentContent.trim(),
          timestamp: new Date().toISOString()
        });
      }
      currentRole = 'user';
      currentContent = line.replace(/^(Human:|User:)\s*/, '');
    } else if (line.startsWith('Assistant:') || line.startsWith('Claude:')) {
      if (currentContent) {
        sessionData.prompts.push({
          role: currentRole,
          content: currentContent.trim(),
          timestamp: new Date().toISOString()
        });
      }
      currentRole = 'assistant';
      currentContent = line.replace(/^(Assistant:|Claude:)\s*/, '');
    } else if (line.trim()) {
      currentContent += '\n' + line;
    }
  }
  
  if (currentContent) {
    sessionData.prompts.push({
      role: currentRole,
      content: currentContent.trim(),
      timestamp: new Date().toISOString()
    });
  }
  
  return sessionData;
}