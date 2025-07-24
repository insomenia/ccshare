import fs from 'fs/promises';
import path from 'path';
import { SessionData, Prompt, FileChange, ThoughtBlock, ToolCall, MCPServer, AssistantAction, ToolExecution, RawSessionData, RawSessionEntry } from './types.js';
import { appendFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { detectTechStack } from './tech-detector.js';

// Debug logging to file
function debugLog(message: string) {
  if (process.env.DEBUG_PARENT_CHAIN) {
    appendFileSync('parent-chain-debug.log', `${new Date().toISOString()} - ${message}\n`);
  }
}

// Get additional metadata
async function getAdditionalMetadata(): Promise<any> {
  const metadata: any = {};
  
  // Get Git information
  try {
    metadata.gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    metadata.gitCommitCount = parseInt(execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim());
    metadata.gitRemoteUrl = execSync('git config --get remote.origin.url', { encoding: 'utf8' }).trim();
  } catch {
    // Not a git repository or git not available
  }
  
  // Get Node.js version
  metadata.nodeVersion = process.version;
  
  // Get npm version
  try {
    metadata.npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
  } catch {
    // npm not available
  }
  
  // Get OS information
  metadata.osInfo = {
    platform: process.platform,
    arch: process.arch,
    release: process.release.name,
    version: process.version
  };
  
  // Get Claude settings
  try {
    const settingsPath = path.join(process.env.HOME || '', '.claude', 'settings.json');
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
      metadata.claudeSettings = {
        permissions: settings.permissions?.allow || [],
        model: settings.model
      };
    }
  } catch {
    // Settings file not available
  }
  
  // Get CLAUDE.md content if it exists
  try {
    const claudeMdPath = path.join(process.cwd(), 'CLAUDE.md');
    metadata.claudeMd = await fs.readFile(claudeMdPath, 'utf-8');
  } catch {
    // CLAUDE.md doesn't exist
  }
  
  metadata.workingDirectory = process.cwd();
  
  return metadata;
}

// Calculate session statistics
function calculateSessionStats(sessionData: SessionData): any {
  const stats: any = {};
  
  // Calculate total tokens used
  let totalTokens = 0;
  let totalResponseTime = 0;
  let responseCount = 0;
  
  sessionData.prompts.forEach(prompt => {
    if (prompt.usage?.total_tokens) {
      totalTokens += prompt.usage.total_tokens;
    }
    if (prompt.responseTimeMs) {
      totalResponseTime += prompt.responseTimeMs;
      responseCount++;
    }
  });
  
  stats.totalTokensUsed = totalTokens > 0 ? totalTokens : undefined;
  stats.averageResponseTime = responseCount > 0 ? Math.round(totalResponseTime / responseCount) : undefined;
  stats.totalToolCalls = sessionData.toolCalls?.length || 0;
  
  // Count errors from tool executions
  let errorCount = 0;
  sessionData.toolExecutions?.forEach(exec => {
    if (exec.status === 'error') errorCount++;
  });
  stats.errorCount = errorCount > 0 ? errorCount : undefined;
  
  return stats;
}

// Generate a formatted diff for display
function generateSimpleDiff(oldContent: string, newContent: string, filePath: string): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  
  let diff = '';
  let lineNum = 1;
  let changes: Array<{start: number, end: number, added: string[], removed: string[]}> = [];
  let currentChange: {start: number, end: number, added: string[], removed: string[]} | null = null;
  
  // Find all changes
  for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    
    if (oldLine !== newLine) {
      if (!currentChange) {
        currentChange = { start: i + 1, end: i + 1, added: [], removed: [] };
      }
      currentChange.end = i + 1;
      
      if (oldLine !== undefined && newLine === undefined) {
        currentChange.removed.push(oldLine);
      } else if (oldLine === undefined && newLine !== undefined) {
        currentChange.added.push(newLine);
      } else {
        currentChange.removed.push(oldLine);
        currentChange.added.push(newLine);
      }
    } else if (currentChange) {
      changes.push(currentChange);
      currentChange = null;
    }
  }
  
  if (currentChange) {
    changes.push(currentChange);
  }
  
  // Generate formatted output
  if (changes.length === 0) {
    return 'No changes';
  }
  
  // Create summary
  const totalAdded = changes.reduce((sum, c) => sum + c.added.length, 0);
  const totalRemoved = changes.reduce((sum, c) => sum + c.removed.length, 0);
  
  diff = `⏺ Update(${filePath})\n`;
  diff += `  ⎿  Updated ${filePath} with `;
  
  if (totalAdded > 0 && totalRemoved > 0) {
    diff += `${totalAdded} addition${totalAdded > 1 ? 's' : ''} and ${totalRemoved} removal${totalRemoved > 1 ? 's' : ''}\n`;
  } else if (totalAdded > 0) {
    diff += `${totalAdded} addition${totalAdded > 1 ? 's' : ''}\n`;
  } else {
    diff += `${totalRemoved} removal${totalRemoved > 1 ? 's' : ''}\n`;
  }
  
  // Show changes with context
  changes.forEach((change, idx) => {
    if (idx > 0) diff += '\n';
    
    // Show context before
    const contextStart = Math.max(0, change.start - 4);
    for (let i = contextStart; i < change.start - 1; i++) {
      diff += `       ${String(i + 1).padStart(3)} ${oldLines[i] || ''}\n`;
    }
    
    // Show removed lines
    let oldLineNum = change.start;
    change.removed.forEach(line => {
      diff += `       ${String(oldLineNum).padStart(3)} - ${line}\n`;
      oldLineNum++;
    });
    
    // Show added lines
    let newLineNum = change.start;
    change.added.forEach(line => {
      diff += `       ${String(newLineNum).padStart(3)} + ${line}\n`;
      newLineNum++;
    });
    
    // Show context after
    const contextEnd = Math.min(newLines.length, change.end + 2);
    for (let i = change.end; i < contextEnd; i++) {
      diff += `       ${String(i + 1).padStart(3)} ${newLines[i] || ''}\n`;
    }
  });
  
  return diff;
}

// Extract tool calls from content
function extractToolCalls(content: string | any[]): string[] {
  const toolCalls = new Set<string>();
  
  // Handle array content (JSONL format)
  if (Array.isArray(content)) {
    content.forEach(item => {
      if (item.type === 'tool_use' && item.name) {
        toolCalls.add(item.name);
      }
    });
    return Array.from(toolCalls);
  }
  
  // Handle string content - look for function_calls blocks
  if (typeof content === 'string') {
    // Pattern for tool invocations in XML format
    const toolPattern = /<invoke name="([^"]+)">/g;
    let match;
    while ((match = toolPattern.exec(content)) !== null) {
      toolCalls.add(match[1]);
    }
    
    // Also check older format
    const oldPattern = /<function_calls>[\s\S]*?<invoke name="([^"]+)">/g;
    while ((match = oldPattern.exec(content)) !== null) {
      toolCalls.add(match[1]);
    }
  }
  
  return Array.from(toolCalls);
}

// Detect if a prompt is auto-generated
function extractAssistantActions(content: string, timestamp: string): AssistantAction[] {
  const actions: AssistantAction[] = [];
  
  // Simply capture the entire assistant response as one action
  // This includes any completion summaries, explanations, etc.
  if (content && content.trim()) {
    // Remove tool_use patterns that are already tracked separately
    const cleanContent = content
      .split('\n')
      .filter(line => !line.trim().startsWith('⏺ ') || line.includes('완료'))
      .join('\n')
      .trim();
    
    if (cleanContent) {
      actions.push({
        type: 'explanation',
        description: cleanContent,
        timestamp
      });
    }
  }
  
  return actions;
}

function isAutoGeneratedPrompt(content: string): boolean {
  // Check for command messages
  if (content.includes('<command-message>') || content.includes('<command-name>')) {
    return true;
  }
  
  // Check for system reminders
  if (content.includes('<system-reminder>')) {
    return true;
  }
  
  // Check for hook messages
  if (content.includes('<user-prompt-submit-hook>')) {
    return true;
  }
  
  // Check for local command stdout
  if (content.includes('<local-command-stdout>')) {
    return true;
  }
  
  // Check for "Caveat:" messages generated by local commands
  if (content.startsWith('Caveat: The messages below were generated by the user while running local commands')) {
    return true;
  }
  
  // Check for specific auto-generated patterns
  const autoPatterns = [
    /^Command: \/\w+/,  // Slash commands
    /^\[Tool output\]/,  // Tool outputs
    /^System: /,  // System messages
    /^Auto-generated: /  // Explicitly marked
  ];
  
  return autoPatterns.some(pattern => pattern.test(content.trim()));
}

// Extract file paths from assistant responses
function extractFilesFromContent(content: string | any[]): string[] {
  const files = new Set<string>();
  
  // Handle array content (JSONL format)
  if (Array.isArray(content)) {
    content.forEach(item => {
      if (item.type === 'tool_use' && item.input && item.input.file_path) {
        files.add(item.input.file_path);
      }
    });
    return Array.from(files);
  }
  
  // Handle string content
  if (typeof content !== 'string') {
    return [];
  }
  
  // Pattern 1: Tool usage blocks - Edit, Write, MultiEdit
  const toolPattern = /<function_calls>[\s\S]*?<parameter name="file_path">(.*?)<\/antml:parameter>[\s\S]*?<\/antml:function_calls>/g;
  let match;
  while ((match = toolPattern.exec(content)) !== null) {
    const filePath = match[1].trim();
    if (filePath) {
      files.add(filePath);
    }
  }
  
  // Pattern 2: File paths in code blocks
  const codeBlockPattern = /```[^\n]*\n.*?(?:\/[\w\-./]+\.[\w]+).*?\n```/gs;
  while ((match = codeBlockPattern.exec(content)) !== null) {
    const blockContent = match[0];
    // Extract file paths that look like absolute or relative paths
    const pathPattern = /(?:^|\s|["'`])((\/[\w\-./]+|\.\/[\w\-./]+|[\w\-./]+\/[\w\-./]+)\.[\w]+)/gm;
    let pathMatch;
    while ((pathMatch = pathPattern.exec(blockContent)) !== null) {
      const filePath = pathMatch[1].trim();
      if (filePath && !filePath.includes('node_modules') && !filePath.includes('.git')) {
        files.add(filePath);
      }
    }
  }
  
  // Pattern 3: Explicit file references in text
  const fileRefPattern = /(?:(?:created?|modif(?:y|ied)|updated?|wrote|edited?|changed?|added?|fixed|implement(?:ed)?)\s+(?:the\s+)?(?:file\s+)?)[`'"](.*?)[`'"]/gi;
  while ((match = fileRefPattern.exec(content)) !== null) {
    const filePath = match[1].trim();
    if (filePath && filePath.includes('.')) {
      files.add(filePath);
    }
  }
  
  return Array.from(files);
}

export async function captureRawSession(sessionPath?: string, limit: number = 20): Promise<RawSessionData> {
  const rawData: RawSessionData = {
    prompts: [],
    metadata: {}
  };

  // Get current session JSONL file
  const currentPath = process.cwd();
  const projectDirName = currentPath.replace(/[^a-zA-Z0-9]/g, '-');
  const claudeProjectPath = path.join(process.env.HOME || '', '.claude', 'projects', projectDirName);
  
  try {
    const files = await fs.readdir(claudeProjectPath);
    const jsonlFiles = files.filter(file => file.endsWith('.jsonl'));
    
    if (jsonlFiles.length === 0) {
      return rawData;
    }
    
    // Find the most recently modified JSONL file (current session)
    const fileStats = await Promise.all(
      jsonlFiles.map(async (file) => {
        const filePath = path.join(claudeProjectPath, file);
        const stat = await fs.stat(filePath);
        return { file, mtime: stat.mtime.getTime() };
      })
    );
    
    // Sort by modification time (most recent first)
    fileStats.sort((a, b) => b.mtime - a.mtime);
    const latestFile = path.join(claudeProjectPath, fileStats[0].file);
    const content = await fs.readFile(latestFile, 'utf-8');
    const lines = content.trim().split('\n');
    
    const entries: RawSessionEntry[] = [];
    
    // Parse all entries
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        entries.push(entry);
      } catch {
        // Skip malformed lines
      }
    }
    
    // Find user prompts (type: "user" with message.role: "user" and content is text)
    const userPromptIndices: number[] = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.type === 'user' && 
          entry.message?.role === 'user' && 
          typeof entry.message?.content === 'string') {
        // Check if it's an auto-generated prompt
        const content = entry.message.content;
        if (!isAutoGeneratedPrompt(content)) {
          userPromptIndices.push(i);
        }
      }
    }
    
    // Get the last N user prompts
    const selectedIndices = userPromptIndices.slice(-limit);
    
    // Extract session data for each selected prompt
    for (let i = 0; i < selectedIndices.length; i++) {
      const startIdx = selectedIndices[i];
      const endIdx = i < selectedIndices.length - 1 ? selectedIndices[i + 1] : entries.length;
      
      rawData.prompts.push({
        userPrompt: entries[startIdx],
        sessionEntries: entries.slice(startIdx + 1, endIdx)
      });
    }
    
    // Add metadata
    rawData.metadata = await getAdditionalMetadata();
    
    // Add tech stack information
    try {
      const techStack = await detectTechStack(process.cwd());
      rawData.metadata.techStack = techStack;
    } catch (error) {
      console.error('Error detecting tech stack:', error);
    }
    
    return rawData;
  } catch (error) {
    console.error('Error reading session:', error);
    return rawData;
  }
}

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
    return await getCurrentSessionData();
  }
  
  // Should never reach here
  throw new Error('No session path provided');
}

export function parseSessionData(rawData: string): SessionData {
  try {
    const data = JSON.parse(rawData);
    
    const sessionData: SessionData = {
      timestamp: new Date().toISOString(),
      prompts: [],
      changes: [],
      thoughts: [],
      assistantActions: [], // Initialize assistant actions array
      toolExecutions: [], // Initialize tool executions array
      metadata: {
        claudeVersion: data.claudeVersion || 'unknown',
        platform: process.platform,
        workingDirectory: process.cwd()
      }
    };
    
    // Extract prompts from conversation
    if (data.messages && Array.isArray(data.messages)) {
      sessionData.prompts = data.messages.map((msg: any, index: number) => {
        const prompt: Prompt = {
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp || new Date().toISOString(),
          isAutoGenerated: msg.role === 'user' ? isAutoGeneratedPrompt(msg.content) : false
        };
        
        // Extract associated files from assistant responses
        if (msg.role === 'assistant') {
          const associatedFiles = extractFilesFromContent(msg.content);
          if (associatedFiles.length > 0) {
            prompt.associatedFiles = associatedFiles;
            
            // Also add to previous user prompt
            if (index > 0 && data.messages[index - 1].role === 'user') {
              const prevPromptIndex = sessionData.prompts.length - 1;
              if (prevPromptIndex >= 0) {
                sessionData.prompts[prevPromptIndex].associatedFiles = associatedFiles;
              }
            }
          }
          
          // Extract assistant actions
          const actions = extractAssistantActions(msg.content, msg.timestamp || new Date().toISOString());
          if (actions.length > 0 && sessionData.assistantActions) {
            sessionData.assistantActions.push(...actions);
          }
        }
        
        return prompt;
      });
    }
    
    // Extract file changes
    if (data.fileChanges && Array.isArray(data.fileChanges)) {
      sessionData.changes = data.fileChanges.map((change: any) => {
        const fileChange: FileChange = {
          type: change.type,
          path: change.path,
          content: change.content,
          oldContent: change.oldContent,
          timestamp: change.timestamp || new Date().toISOString()
        };
        
        // Generate diff if we have old and new content
        if (change.oldContent && change.content && change.type === 'edit') {
          fileChange.diff = generateSimpleDiff(change.oldContent, change.content, change.path);
        }
        
        return fileChange;
      });
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
        const prompt: Prompt = {
          role: currentRole,
          content: currentContent.trim(),
          timestamp: new Date().toISOString(),
          isAutoGenerated: currentRole === 'user' ? isAutoGeneratedPrompt(currentContent.trim()) : false
        };
        
        // Extract files from assistant content
        if (currentRole === 'assistant') {
          const associatedFiles = extractFilesFromContent(currentContent);
          if (associatedFiles.length > 0) {
            prompt.associatedFiles = associatedFiles;
            
            // Add to previous user prompt if exists
            if (sessionData.prompts.length > 0) {
              const lastPrompt = sessionData.prompts[sessionData.prompts.length - 1];
              if (lastPrompt.role === 'user') {
                lastPrompt.associatedFiles = associatedFiles;
              }
            }
          }
        }
        
        sessionData.prompts.push(prompt);
      }
      currentRole = 'user';
      currentContent = line.replace(/^(Human:|User:)\s*/, '');
    } else if (line.startsWith('Assistant:') || line.startsWith('Claude:')) {
      if (currentContent) {
        const prompt: Prompt = {
          role: currentRole,
          content: currentContent.trim(),
          timestamp: new Date().toISOString(),
          isAutoGenerated: currentRole === 'user' ? isAutoGeneratedPrompt(currentContent.trim()) : false
        };
        
        // Extract files from assistant content
        if (currentRole === 'assistant') {
          const associatedFiles = extractFilesFromContent(currentContent);
          if (associatedFiles.length > 0) {
            prompt.associatedFiles = associatedFiles;
            
            // Add to previous user prompt if exists
            if (sessionData.prompts.length > 0) {
              const lastPrompt = sessionData.prompts[sessionData.prompts.length - 1];
              if (lastPrompt.role === 'user') {
                lastPrompt.associatedFiles = associatedFiles;
              }
            }
          }
        }
        
        sessionData.prompts.push(prompt);
      }
      currentRole = 'assistant';
      currentContent = line.replace(/^(Assistant:|Claude:)\s*/, '');
    } else if (line.trim()) {
      currentContent += '\n' + line;
    }
  }
  
  if (currentContent) {
    const prompt: Prompt = {
      role: currentRole,
      content: currentContent.trim(),
      timestamp: new Date().toISOString()
    };
    
    // Extract files from assistant content
    if (currentRole === 'assistant') {
      const associatedFiles = extractFilesFromContent(currentContent);
      if (associatedFiles.length > 0) {
        prompt.associatedFiles = associatedFiles;
        
        // Add to previous user prompt if exists
        if (sessionData.prompts.length > 0) {
          const lastPrompt = sessionData.prompts[sessionData.prompts.length - 1];
          if (lastPrompt.role === 'user') {
            lastPrompt.associatedFiles = associatedFiles;
          }
        }
      }
    }
    
    sessionData.prompts.push(prompt);
  }
  
  return sessionData;
}

async function captureAllSessions(): Promise<SessionData> {
  const allPrompts: Prompt[] = [];
  const allChanges: FileChange[] = [];
  const allAssistantActions: AssistantAction[] = [];
  const allToolExecutions: ToolExecution[] = [];
  const allToolCalls: ToolCall[] = [];
  
  // First, add current session
  const currentSession = await getCurrentSessionData();
  allPrompts.push(...currentSession.prompts);
  allChanges.push(...currentSession.changes);
  if (currentSession.assistantActions) allAssistantActions.push(...currentSession.assistantActions);
  if (currentSession.toolExecutions) allToolExecutions.push(...currentSession.toolExecutions);
  if (currentSession.toolCalls) allToolCalls.push(...currentSession.toolCalls);
  
  // Add project-specific Claude history
  const currentPath = process.cwd();
  // Replace all non-alphanumeric characters with dashes, matching Claude's behavior
  // This includes /, ., _, Korean characters, etc.
  const projectDirName = currentPath.replace(/[^a-zA-Z0-9]/g, '-');
  const claudeProjectPath = path.join(process.env.HOME || '', '.claude', 'projects', projectDirName);
  
  try {
    const sessionData = await captureSessionsFromDirectory(claudeProjectPath);
    allPrompts.push(...sessionData.prompts);
    allChanges.push(...sessionData.changes);
    if (sessionData.assistantActions) allAssistantActions.push(...sessionData.assistantActions);
    if (sessionData.toolExecutions) allToolExecutions.push(...sessionData.toolExecutions);
    if (sessionData.toolCalls) allToolCalls.push(...sessionData.toolCalls);
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
      if (sessionData.assistantActions) allAssistantActions.push(...sessionData.assistantActions);
      if (sessionData.toolExecutions) allToolExecutions.push(...sessionData.toolExecutions);
      if (sessionData.toolCalls) allToolCalls.push(...sessionData.toolCalls);
    } catch {
      // Directory doesn't exist or can't be read
    }
  }
  
  // Sort prompts by timestamp
  allPrompts.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  // Create session data
  const sessionData: SessionData = {
    timestamp: new Date().toISOString(),
    prompts: allPrompts,
    changes: allChanges,
    assistantActions: allAssistantActions,
    toolExecutions: allToolExecutions,
    toolCalls: allToolCalls,
    metadata: {
      platform: process.platform,
      workingDirectory: process.cwd(),
      claudeProjectPath: claudeProjectPath
    }
  };
  
  // Add additional metadata
  const additionalMetadata = await getAdditionalMetadata();
  sessionData.metadata = { ...sessionData.metadata, ...additionalMetadata };
  
  // Calculate session statistics
  sessionData.metadata!.sessionStats = calculateSessionStats(sessionData);
  
  return sessionData;
}

async function captureSessionsFromDirectory(dirPath: string): Promise<SessionData> {
  const files = await fs.readdir(dirPath);
  const sessionFiles = files.filter(f => f.endsWith('.json') || f.endsWith('.jsonl') || f.endsWith('.txt') || f.endsWith('.md'));
  
  const allPrompts: Prompt[] = [];
  const allChanges: FileChange[] = [];
  const allAssistantActions: AssistantAction[] = [];
  const allToolExecutions: ToolExecution[] = [];
  const allToolCalls: ToolCall[] = [];
  
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
      if (sessionData.assistantActions) allAssistantActions.push(...sessionData.assistantActions);
      if (sessionData.toolExecutions) allToolExecutions.push(...sessionData.toolExecutions);
      if (sessionData.toolCalls) allToolCalls.push(...sessionData.toolCalls);
    } catch {
      // Skip files that can't be parsed
    }
  }
  
  // Sort prompts by timestamp
  allPrompts.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  // Create session data
  const sessionData: SessionData = {
    timestamp: new Date().toISOString(),
    prompts: allPrompts,
    changes: allChanges,
    assistantActions: allAssistantActions,
    toolExecutions: allToolExecutions,
    toolCalls: allToolCalls,
    metadata: {
      platform: process.platform,
      workingDirectory: process.cwd()
    }
  };
  
  // Add additional metadata
  const additionalMetadata = await getAdditionalMetadata();
  sessionData.metadata = { ...sessionData.metadata, ...additionalMetadata };
  
  // Calculate session statistics
  sessionData.metadata!.sessionStats = calculateSessionStats(sessionData);
  
  return sessionData;
}

export function parseJSONLSessionData(rawData: string): SessionData {
  const sessionData: SessionData = {
    timestamp: new Date().toISOString(),
    prompts: [],
    changes: [],
    toolCalls: [],
    assistantActions: [],
    toolExecutions: [],
    metadata: {
      platform: process.platform,
      workingDirectory: process.cwd(),
      models: [],
      mcpServers: []
    }
  };
  
  
  const lines = rawData.split('\n').filter(line => line.trim());
  const entriesByUuid = new Map<string, any>();
  const fileChangesByPrompt = new Map<string, FileChange[]>();
  const allEntries: any[] = [];
  
  // First pass: build a map of all entries by UUID and collect all entries
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.uuid) {
        entriesByUuid.set(entry.uuid, entry);
      }
      allEntries.push(entry);
    } catch {
      // Skip malformed JSON lines
    }
  }
  
  // Second pass: process messages and toolUseResults
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      
      // Handle toolUseResult entries
      if (entry.toolUseResult) {
        const result = entry.toolUseResult;
        
        // Handle new format (MultiEdit/Edit)
        if (result.filePath && result.edits && Array.isArray(result.edits)) {
          // Process each edit as a separate file change
          for (const edit of result.edits) {
            const fileChange: FileChange = {
              type: 'edit',
              path: result.filePath,
              content: edit.new_string,
              oldContent: edit.old_string,
              timestamp: entry.timestamp || new Date().toISOString()
            };
            
            // Generate diff if we have old and new content
            if (edit.old_string && edit.new_string) {
              const diff = generateSimpleDiff(edit.old_string, edit.new_string, result.filePath);
              fileChange.diff = diff;
            }
            
            // Find the real user prompt (not tool_result)
            let currentEntry = entry;
            let userPromptUuid = null;
            const visited = new Set<string>();
            
            // Debug logging
            debugLog(`\n[DEBUG] Searching for user prompt for file: ${result.filePath}`);
            debugLog(`[DEBUG] Starting from UUID: ${entry.uuid}`);
            
            // Traverse up the parent chain to find the original user prompt
            let depth = 0;
            const maxDepth = 20; // Prevent infinite loops
            
            while (currentEntry && currentEntry.parentUuid && !visited.has(currentEntry.uuid) && depth < maxDepth) {
              visited.add(currentEntry.uuid);
              depth++;
              
              const parent = entriesByUuid.get(currentEntry.parentUuid);
              if (parent) {
                debugLog(`[DEBUG] Depth ${depth}, Parent type: ${parent.type}, UUID: ${parent.uuid}`);
                
                if (parent.type === 'user' && parent.message) {
                  // Check if it's a tool_result
                  const isToolResult = parent.message.content?.[0]?.type === 'tool_result';
                  
                  if (isToolResult) {
                    // Skip tool_result messages and continue traversing
                    debugLog(`[DEBUG] Skipping tool_result message`);
                  } else {
                    // Check if it's a real user message
                    let content = '';
                    if (typeof parent.message.content === 'string') {
                      content = parent.message.content;
                    } else if (Array.isArray(parent.message.content)) {
                      const textItem = parent.message.content.find((item: any) => item.type === 'text');
                      if (textItem && textItem.text) {
                        content = textItem.text;
                      }
                    }
                    
                    debugLog(`[DEBUG] User message content: "${content.substring(0, 100)}..."`);
                    
                    // Exclude system messages and file change outputs
                    if (content && 
                        !content.includes('<function_calls>') && 
                        !content.includes('Todos have been modified') &&
                        !content.includes('<system-reminder>') &&
                        !content.includes('Tool ran without output') &&
                        !content.includes('⏺ Update(') &&
                        !content.includes('⏺ Read(') &&
                        !content.includes('This session is being continued from')) {
                      userPromptUuid = parent.uuid;
                      debugLog(`[DEBUG] Found real user prompt! UUID: ${userPromptUuid}`);
                      break;
                    } else {
                      debugLog(`[DEBUG] Skipping system/tool message`);
                    }
                  }
                }
                currentEntry = parent;
              } else {
                break;
              }
            }
            
            if (depth >= maxDepth) {
              debugLog(`[DEBUG] WARNING: Max depth ${maxDepth} reached without finding user prompt`);
            }
            
            if (userPromptUuid) {
              if (!fileChangesByPrompt.has(userPromptUuid)) {
                fileChangesByPrompt.set(userPromptUuid, []);
              }
              fileChangesByPrompt.get(userPromptUuid)!.push(fileChange);
            }
            
            sessionData.changes.push(fileChange);
          }
        }
        // Handle old format (single edit with oldString/newString)
        else if (result.filePath && (result.oldString || result.newString)) {
          const fileChange: FileChange = {
            type: 'edit',
            path: result.filePath,
            content: result.newString,
            oldContent: result.oldString || result.originalFile,
            timestamp: entry.timestamp || new Date().toISOString()
          };
          
          // Generate diff if we have old and new content
          if (result.oldString && result.newString) {
            const diff = generateSimpleDiff(result.oldString, result.newString, result.filePath);
            fileChange.diff = diff;
          }
          
          // Store structured patch if available
          if (result.structuredPatch) {
            fileChange.structuredPatch = result.structuredPatch;
          }
          
          // Find the real user prompt (not tool_result)
          let currentEntry = entry;
          let userPromptUuid = null;
          const visited = new Set<string>();
          let depth = 0;
          const maxDepth = 20; // Prevent infinite loops
          
          // Traverse up the parent chain to find the original user prompt
          while (currentEntry && currentEntry.parentUuid && !visited.has(currentEntry.uuid) && depth < maxDepth) {
            visited.add(currentEntry.uuid);
            depth++;
            const parent = entriesByUuid.get(currentEntry.parentUuid);
            if (parent) {
              if (parent.type === 'user' && parent.message) {
                // Check if it's a tool_result
                const isToolResult = parent.message.content?.[0]?.type === 'tool_result';
                
                if (isToolResult) {
                  // Skip tool_result messages and continue traversing
                  debugLog(`[DEBUG] Skipping tool_result message`);
                } else {
                  // Check if it's a real user message
                  let content = '';
                  if (typeof parent.message.content === 'string') {
                    content = parent.message.content;
                  } else if (Array.isArray(parent.message.content)) {
                    const textItem = parent.message.content.find((item: any) => item.type === 'text');
                    if (textItem && textItem.text) {
                      content = textItem.text;
                    }
                  }
                  
                  // Exclude system messages and file change outputs
                  if (content && 
                      !content.includes('<function_calls>') && 
                      !content.includes('Todos have been modified') &&
                      !content.includes('<system-reminder>') &&
                      !content.includes('Tool ran without output') &&
                      !content.includes('⏺ Update(') &&
                      !content.includes('⏺ Read(') &&
                      !content.includes('This session is being continued from')) {
                    userPromptUuid = parent.uuid;
                    break;
                  }
                }
              }
              currentEntry = parent;
            } else {
              break;
            }
          }
          
          if (depth >= maxDepth) {
            debugLog(`[DEBUG] WARNING: Max depth ${maxDepth} reached without finding user prompt`);
          }
          
          if (userPromptUuid) {
            if (!fileChangesByPrompt.has(userPromptUuid)) {
              fileChangesByPrompt.set(userPromptUuid, []);
            }
            fileChangesByPrompt.get(userPromptUuid)!.push(fileChange);
          }
          
          sessionData.changes.push(fileChange);
        }
      }
      
      // Handle user messages
      if (entry.type === 'user' && entry.message) {
        const msg = entry.message;
        let content = '';
        
        if (typeof msg.content === 'string') {
          content = msg.content;
        } else if (Array.isArray(msg.content)) {
          // Handle both text and tool_result content
          const contentParts: string[] = [];
          let hasToolResult = false;
          
          msg.content.forEach((item: any) => {
            if (item.type === 'text') {
              contentParts.push(item.text);
            } else if (item.type === 'tool_result') {
              hasToolResult = true;
              // Add tool result to assistant actions
              if (sessionData.assistantActions && item.content) {
                const toolResultAction: AssistantAction = {
                  type: 'command_execution',
                  description: `Tool result: ${item.content.substring(0, 200)}${item.content.length > 200 ? '...' : ''}`,
                  timestamp: entry.timestamp || new Date().toISOString()
                };
                sessionData.assistantActions.push(toolResultAction);
              }
            }
          });
          
          // Only process as user message if it's not just a tool result
          if (!hasToolResult || contentParts.length > 0) {
            content = contentParts.join('\n');
          }
        }
        
        if (content && msg.role === 'user') {
          const prompt: Prompt = {
            role: 'user',
            content: content,
            timestamp: entry.timestamp || new Date().toISOString(),
            isAutoGenerated: isAutoGeneratedPrompt(content),
            uuid: entry.uuid
          } as Prompt & { uuid?: string };
          
          // Check if there are associated file changes
          const associatedChanges = fileChangesByPrompt.get(entry.uuid);
          if (associatedChanges && associatedChanges.length > 0) {
            prompt.associatedFiles = [...new Set(associatedChanges.map(c => c.path))];
          }
          
          sessionData.prompts.push(prompt);
        }
      }
      
      // Handle assistant messages with usage info
      if (entry.type === 'assistant' && entry.message) {
        const msg = entry.message;
        let content = '';
        
        if (Array.isArray(msg.content)) {
          // Include both text and tool_use content
          const contentParts: string[] = [];
          
          msg.content.forEach((item: any) => {
            if (item.type === 'text') {
              contentParts.push(item.text);
            } else if (item.type === 'tool_use') {
              // Format tool use as markdown
              contentParts.push(`\n⏺ ${item.name}`);
              
              // Track tool execution
              if (sessionData.toolExecutions) {
                const toolExecution: ToolExecution = {
                  tool: item.name,
                  timestamp: entry.timestamp || new Date().toISOString(),
                  parameters: item.input,
                  promptId: entry.parentUuid
                };
                sessionData.toolExecutions.push(toolExecution);
                debugLog(`[DEBUG] Added tool execution: ${item.name}`);
              }
              
              if (item.input) {
                // Show tool parameters
                if (item.name === 'Bash' && item.input.command) {
                  contentParts.push(`  ⎿ ${item.input.command}`);
                } else if (item.name === 'Edit' && item.input.file_path) {
                  contentParts.push(`  ⎿ ${item.input.file_path}`);
                } else if (item.name === 'TodoWrite') {
                  contentParts.push(`  ⎿ Update Todos`);
                } else if (item.name === 'Read' && item.input.file_path) {
                  contentParts.push(`  ⎿ ${item.input.file_path}`);
                }
              }
            }
          });
          
          content = contentParts.join('\n');
        }
        
        if (content) {
          const prompt: Prompt = {
            role: 'assistant',
            content: content,
            timestamp: entry.timestamp || new Date().toISOString()
          };
          
          // Extract actions from assistant response
          const actions = extractAssistantActions(content, entry.timestamp || new Date().toISOString());
          debugLog(`[DEBUG] Extracted ${actions.length} actions from assistant response`);
          if (actions.length > 0 && sessionData.assistantActions) {
            // Link actions to the previous user prompt
            const lastUserPrompt = sessionData.prompts.filter(p => p.role === 'user').pop();
            if (lastUserPrompt) {
              actions.forEach(action => {
                action.promptId = entry.parentUuid;  // Link to parent prompt
              });
            }
            sessionData.assistantActions.push(...actions);
            debugLog(`[DEBUG] Total assistant actions: ${sessionData.assistantActions.length}`);
          }
          
          // Extract model info if available
          if (entry.model || msg.model) {
            prompt.model = entry.model || msg.model;
            // Add to models list if not already there
            if (sessionData.metadata?.models && prompt.model && !sessionData.metadata.models.includes(prompt.model)) {
              sessionData.metadata.models.push(prompt.model);
            }
          }
          
          // Extract tool calls from content
          const toolNames = extractToolCalls(msg.content);
          if (toolNames.length > 0) {
            prompt.toolCalls = toolNames;
            
            // Track all tool calls
            toolNames.forEach(toolName => {
              const toolCall: ToolCall = {
                name: toolName,
                timestamp: entry.timestamp || new Date().toISOString(),
                isMCP: toolName.startsWith('mcp__')
              };
              sessionData.toolCalls?.push(toolCall);
              
              // Track MCP servers
              if (toolName.startsWith('mcp__')) {
                const serverName = toolName.split('__')[1]?.split('__')[0];
                if (serverName && sessionData.metadata?.mcpServers) {
                  let server = sessionData.metadata.mcpServers.find(s => s.name === serverName);
                  if (!server) {
                    server = { name: serverName, tools: [] };
                    sessionData.metadata.mcpServers.push(server);
                  }
                  if (!server.tools.includes(toolName)) {
                    server.tools.push(toolName);
                  }
                }
              }
            });
          }
          
          // Add token usage if available
          if (msg.usage) {
            prompt.usage = {
              input_tokens: msg.usage.input_tokens,
              output_tokens: msg.usage.output_tokens,
              cache_creation_input_tokens: msg.usage.cache_creation_input_tokens,
              cache_read_input_tokens: msg.usage.cache_read_input_tokens,
              total_tokens: (msg.usage.input_tokens || 0) + 
                           (msg.usage.output_tokens || 0) +
                           (msg.usage.cache_creation_input_tokens || 0) +
                           (msg.usage.cache_read_input_tokens || 0)
            };
          }
          
          // Calculate response time if we can find the parent user message
          if (entry.parentUuid && entriesByUuid.has(entry.parentUuid)) {
            const parentEntry = entriesByUuid.get(entry.parentUuid);
            if (parentEntry.timestamp) {
              const responseTime = new Date(entry.timestamp).getTime() - 
                                 new Date(parentEntry.timestamp).getTime();
              prompt.responseTimeMs = responseTime;
            }
          }
          
          // Check if there are file changes associated with this assistant response
          const parentUserUuid = entry.parentUuid;
          if (parentUserUuid) {
            const associatedChanges = fileChangesByPrompt.get(parentUserUuid);
            if (associatedChanges && associatedChanges.length > 0) {
              const associatedFiles = [...new Set(associatedChanges.map(c => c.path))];
              prompt.associatedFiles = associatedFiles;
              
              // Also update the previous user prompt
              if (sessionData.prompts.length > 0) {
                const lastPrompt = sessionData.prompts[sessionData.prompts.length - 1];
                if (lastPrompt.role === 'user') {
                  lastPrompt.associatedFiles = associatedFiles;
                }
              }
            }
          }
          
          sessionData.prompts.push(prompt);
        }
      }
      
      // Handle tool result entries (separate from user messages with tool_result content)
      if (entry.type === 'tool_result' && entry.content) {
        // Update the latest tool execution with result
        if (sessionData.toolExecutions && sessionData.toolExecutions.length > 0) {
          // Find the most recent tool execution without a result
          for (let i = sessionData.toolExecutions.length - 1; i >= 0; i--) {
            if (!sessionData.toolExecutions[i].result) {
              sessionData.toolExecutions[i].result = entry.content;
              sessionData.toolExecutions[i].status = entry.error ? 'error' : 'success';
              
              // If this is an Edit/MultiEdit tool result, check for file changes
              const tool = sessionData.toolExecutions[i].tool;
              if ((tool === 'Edit' || tool === 'MultiEdit') && entry.toolUseResult) {
                const result = entry.toolUseResult;
                if (result.filePath) {
                  // Find the corresponding file change
                  const fileChange = sessionData.changes.find(c => 
                    c.path === result.filePath && 
                    Math.abs(new Date(c.timestamp).getTime() - new Date(entry.timestamp || '').getTime()) < 1000
                  );
                  
                  if (fileChange) {
                    sessionData.toolExecutions[i].fileChange = {
                      filePath: result.filePath,
                      changeType: fileChange.type,
                      diff: fileChange.diff,
                      oldContent: fileChange.oldContent,
                      newContent: fileChange.content
                    };
                  }
                }
              }
              break;
            }
          }
        }
      }
    } catch {
      // Skip malformed JSON lines
    }
  }
  
  
  return sessionData;
}

async function getCurrentSessionData(): Promise<SessionData> {
  // Check Claude's project folder for current session
  const currentPath = process.cwd();
  const projectDirName = currentPath.replace(/[^a-zA-Z0-9]/g, '-');
  const claudeProjectPath = path.join(process.env.HOME || '', '.claude', 'projects', projectDirName);
  
  try {
    const sessionData = await captureSessionsFromDirectory(claudeProjectPath);
    // Add metadata
    sessionData.metadata = {
      ...sessionData.metadata,
      claudeProjectPath: claudeProjectPath
    };
    return sessionData;
  } catch (err) {
    // If project directory doesn't exist, return empty session
    return {
      timestamp: new Date().toISOString(),
      prompts: [],
      changes: [],
      metadata: {
        platform: process.platform,
        workingDirectory: process.cwd(),
        claudeProjectPath: claudeProjectPath
      }
    };
  }
}