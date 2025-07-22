import fs from 'fs/promises';
import path from 'path';
import { SessionData, Prompt, FileChange, ThoughtBlock } from './types.js';

export async function captureSession(sessionPath?: string, includeAll?: boolean): Promise<SessionData> {
  // If includeAll is true, search for all session files
  if (includeAll) {
    return await captureAllSessions();
  }
  
  // If a specific path is provided
  if (sessionPath) {
    const stats = await fs.stat(sessionPath);
    if (stats.isDirectory()) {
      // If it's a directory, find all session files in it
      return await captureSessionsFromDirectory(sessionPath);
    } else {
      // If it's a file, parse it directly
      const rawData = await fs.readFile(sessionPath, 'utf-8');
      return parseSessionData(rawData);
    }
  }
  
  // If no path specified, return current conversation prompts with associated file changes
  if (!sessionPath && !includeAll) {
    return getCurrentSessionData();
  }
  
  // Should never reach here
  throw new Error('No session path provided');
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

async function captureAllSessions(): Promise<SessionData> {
  const allPrompts: Prompt[] = [];
  const allChanges: FileChange[] = [];
  
  // First, add current session
  const currentSession = getCurrentSessionData();
  allPrompts.push(...currentSession.prompts);
  allChanges.push(...currentSession.changes);
  
  // Add project-specific Claude history
  const currentPath = process.cwd();
  const projectDirName = currentPath.replace(/\//g, '-');
  const claudeProjectPath = path.join(process.env.HOME || '', '.claude', 'projects', projectDirName);
  
  try {
    const sessionData = await captureSessionsFromDirectory(claudeProjectPath);
    allPrompts.push(...sessionData.prompts);
    allChanges.push(...sessionData.changes);
  } catch (err) {
    // Project directory doesn't exist
  }
  
  // Also check other possible paths
  const possiblePaths = [
    path.join(process.cwd(), '.claude-sessions')
  ];
  
  for (const dir of possiblePaths) {
    try {
      const sessionData = await captureSessionsFromDirectory(dir);
      allPrompts.push(...sessionData.prompts);
      allChanges.push(...sessionData.changes);
    } catch {
      // Directory doesn't exist or can't be read
    }
  }
  
  // Sort prompts by timestamp
  allPrompts.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  return {
    timestamp: new Date().toISOString(),
    prompts: allPrompts,
    changes: allChanges,
    metadata: {
      platform: process.platform,
      workingDirectory: process.cwd()
    }
  };
}

async function captureSessionsFromDirectory(dirPath: string): Promise<SessionData> {
  const files = await fs.readdir(dirPath);
  const sessionFiles = files.filter(f => f.endsWith('.json') || f.endsWith('.jsonl') || f.endsWith('.txt') || f.endsWith('.md'));
  
  const allPrompts: Prompt[] = [];
  const allChanges: FileChange[] = [];
  
  for (const file of sessionFiles) {
    try {
      const filePath = path.join(dirPath, file);
      const rawData = await fs.readFile(filePath, 'utf-8');
      
      let sessionData: SessionData;
      if (file.endsWith('.jsonl')) {
        sessionData = parseJSONLSessionData(rawData);
      } else {
        sessionData = parseSessionData(rawData);
      }
      
      // Add file source info to prompts
      sessionData.prompts.forEach(prompt => {
        (prompt as any).sourceFile = file;
      });
      
      allPrompts.push(...sessionData.prompts);
      allChanges.push(...sessionData.changes);
    } catch {
      // Skip files that can't be parsed
    }
  }
  
  // Sort prompts by timestamp
  allPrompts.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  return {
    timestamp: new Date().toISOString(),
    prompts: allPrompts,
    changes: allChanges,
    metadata: {
      platform: process.platform,
      workingDirectory: process.cwd()
    }
  };
}

function parseJSONLSessionData(rawData: string): SessionData {
  const sessionData: SessionData = {
    timestamp: new Date().toISOString(),
    prompts: [],
    changes: [],
    metadata: {
      platform: process.platform,
      workingDirectory: process.cwd()
    }
  };
  
  const lines = rawData.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      
      // Handle different types of entries in JSONL
      if (entry.type === 'message' || entry.message) {
        const msg = entry.message || entry;
        if (msg.role && msg.content) {
          // Extract text content from content array if it exists
          let content = '';
          if (typeof msg.content === 'string') {
            content = msg.content;
          } else if (Array.isArray(msg.content)) {
            content = msg.content
              .filter((item: any) => item.type === 'text')
              .map((item: any) => item.text)
              .join('\n');
          }
          
          if (content) {
            sessionData.prompts.push({
              role: msg.role as 'user' | 'assistant',
              content: content,
              timestamp: entry.timestamp || msg.timestamp || new Date().toISOString()
            });
          }
        }
      }
    } catch {
      // Skip malformed JSON lines
    }
  }
  
  return sessionData;
}

function getCurrentSessionData(): SessionData {
  // Return empty session - actual sessions will come from Claude's project folders
  return {
    timestamp: new Date().toISOString(),
    prompts: [],
    changes: [],
    metadata: {
      platform: process.platform,
      workingDirectory: process.cwd()
    }
  };
}