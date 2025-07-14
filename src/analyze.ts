import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

export interface ProjectInfo {
  timestamp: string;
  projectPath: string;
  projectName: string;
  prompts: {
    count: number;
    recent: Array<{
      content: string;
      timestamp?: string;
      response?: string;
    }>;
  };
  changes: {
    files: Array<{
      path: string;
      type: 'created' | 'modified' | 'deleted';
      additions?: number;
      deletions?: number;
      diff?: string;
      codeChanges?: Array<{
        lineNumber: number;
        type: 'added' | 'removed' | 'context';
        content: string;
      }>;
      beforeCode?: string;
      afterCode?: string;
    }>;
    summary: string;
  };
  claudeConfig: {
    exists: boolean;
    content?: any;
  };
  projectSummary: {
    language: string;
    framework?: string;
    description: string;
  };
  sessionHistory?: Array<{
    timestamp: string;
    prompts: number;
    filesChanged: number;
  }>;
}

export async function analyzeProject(): Promise<ProjectInfo> {
  const projectPath = process.cwd();
  const projectName = path.basename(projectPath);
  
  const info: ProjectInfo = {
    timestamp: new Date().toISOString(),
    projectPath,
    projectName,
    prompts: {
      count: 0,
      recent: []
    },
    changes: {
      files: [],
      summary: ''
    },
    claudeConfig: {
      exists: false
    },
    projectSummary: {
      language: 'unknown',
      description: ''
    }
  };

  // Check for CLAUDE.md
  try {
    const claudeMdPath = path.join(projectPath, 'CLAUDE.md');
    const claudeMdContent = await fs.readFile(claudeMdPath, 'utf-8');
    info.claudeConfig.exists = true;
    info.claudeConfig.content = parseClaudeMd(claudeMdContent);
  } catch {
    // No CLAUDE.md file
  }

  // Scan for Claude session history
  await scanSessionHistory(info);

  // Get git history and file changes
  try {
    // Get recent file changes with diffs
    const gitStatus = execSync('git status --porcelain', { encoding: 'utf-8' });
    const changes = gitStatus.trim().split('\n').filter(line => line);
    
    for (const change of changes) {
      const [status, ...fileParts] = change.trim().split(/\s+/);
      const filePath = fileParts.join(' ');
      
      let type: 'created' | 'modified' | 'deleted';
      if (status === 'A' || status === '??') type = 'created';
      else if (status === 'M') type = 'modified';
      else if (status === 'D') type = 'deleted';
      else continue;

      const fileChange: any = {
        path: filePath,
        type
      };

      // Get diff and code changes for modified files
      if (type === 'modified') {
        try {
          const diff = execSync(`git diff --unified=5 "${filePath}"`, { 
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'ignore']
          });
          
          // Parse diff to extract code changes
          const lines = diff.split('\n');
          let additions = 0, deletions = 0;
          const codeChanges: Array<{lineNumber: number; type: 'added' | 'removed' | 'context'; content: string}> = [];
          let currentLine = 0;
          
          lines.forEach(line => {
            if (line.startsWith('@@')) {
              // Parse line numbers from diff header
              const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
              if (match) {
                currentLine = parseInt(match[2]);
              }
            } else if (line.startsWith('+') && !line.startsWith('+++')) {
              additions++;
              codeChanges.push({
                lineNumber: currentLine++,
                type: 'added',
                content: line.substring(1)
              });
            } else if (line.startsWith('-') && !line.startsWith('---')) {
              deletions++;
              codeChanges.push({
                lineNumber: currentLine,
                type: 'removed',
                content: line.substring(1)
              });
            } else if (!line.startsWith('\\') && line.length > 0 && !line.startsWith('diff') && !line.startsWith('index')) {
              // Context line
              if (codeChanges.length > 0 && codeChanges.length < 20) {
                codeChanges.push({
                  lineNumber: currentLine++,
                  type: 'context',
                  content: line.substring(1)
                });
              } else {
                currentLine++;
              }
            }
          });
          
          fileChange.additions = additions;
          fileChange.deletions = deletions;
          fileChange.diff = diff.substring(0, 1000) + (diff.length > 1000 ? '...' : '');
          fileChange.codeChanges = codeChanges.slice(0, 30); // Limit to 30 lines
          
          // Get before/after content for modified files
          try {
            // Current content (after)
            const afterCode = await fs.readFile(path.join(info.projectPath, filePath), 'utf-8');
            fileChange.afterCode = afterCode.substring(0, 500) + (afterCode.length > 500 ? '...' : '');
            
            // Original content (before) - from git
            try {
              const beforeCode = execSync(`git show HEAD:"${filePath}"`, {
                encoding: 'utf-8',
                stdio: ['pipe', 'pipe', 'ignore']
              });
              fileChange.beforeCode = beforeCode.substring(0, 500) + (beforeCode.length > 500 ? '...' : '');
            } catch {
              // File might be new in working directory
            }
          } catch {}
        } catch {}
      }
      
      // For new files, show the content
      if (type === 'created') {
        try {
          const content = await fs.readFile(path.join(info.projectPath, filePath), 'utf-8');
          fileChange.afterCode = content.substring(0, 500) + (content.length > 500 ? '...' : '');
          
          // Count lines for new files
          const lines = content.split('\n');
          fileChange.additions = lines.length;
          
          // Show first few lines as code changes
          fileChange.codeChanges = lines.slice(0, 20).map((line, index) => ({
            lineNumber: index + 1,
            type: 'added' as const,
            content: line
          }));
        } catch {}
      }

      info.changes.files.push(fileChange);
    }

    const totalChanges = info.changes.files.length;
    info.changes.summary = `${totalChanges} file(s) changed`;
  } catch {
    // Not a git repo or git not available
    info.changes.summary = 'Git history not available';
  }

  // Analyze project type
  await analyzeProjectType(info);

  return info;
}

async function analyzeProjectType(info: ProjectInfo) {
  const projectPath = info.projectPath;
  
  try {
    // Check for package.json
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
    
    info.projectSummary.language = 'JavaScript/TypeScript';
    
    // Detect framework
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    if (deps.react) info.projectSummary.framework = 'React';
    else if (deps.vue) info.projectSummary.framework = 'Vue';
    else if (deps.angular) info.projectSummary.framework = 'Angular';
    else if (deps.express) info.projectSummary.framework = 'Express';
    else if (deps.next) info.projectSummary.framework = 'Next.js';
    
    info.projectSummary.description = packageJson.description || 'Node.js project';
    return;
  } catch {}

  try {
    // Check for requirements.txt or setup.py
    await fs.access(path.join(projectPath, 'requirements.txt'));
    info.projectSummary.language = 'Python';
    info.projectSummary.description = 'Python project';
    return;
  } catch {}

  try {
    // Check for Cargo.toml
    const cargoToml = await fs.readFile(path.join(projectPath, 'Cargo.toml'), 'utf-8');
    info.projectSummary.language = 'Rust';
    info.projectSummary.description = 'Rust project';
    return;
  } catch {}

  // Default
  info.projectSummary.description = 'General project';
}

function parseClaudeMd(content: string): any {
  const config: any = {
    instructions: [],
    preferences: {}
  };

  const lines = content.split('\n');
  let currentSection = '';
  
  for (const line of lines) {
    if (line.startsWith('# ')) {
      currentSection = line.substring(2).toLowerCase();
    } else if (line.trim() && currentSection === 'instructions') {
      config.instructions.push(line.trim());
    } else if (line.includes(':') && currentSection === 'preferences') {
      const [key, value] = line.split(':').map(s => s.trim());
      if (key && value) {
        config.preferences[key] = value;
      }
    }
  }

  return config;
}

async function scanSessionHistory(info: ProjectInfo) {
  // Look for Claude session files in common locations
  const sessionPaths = [
    path.join(process.env.HOME || '', '.claude', 'sessions'),
    path.join(process.env.HOME || '', '.claude-code', 'sessions'),
    path.join(info.projectPath, '.claude'),
    path.join(info.projectPath, '.claude-sessions')
  ];

  const allPrompts: Array<{content: string; timestamp?: string; response?: string}> = [];
  const sessionFiles: string[] = [];

  for (const sessionPath of sessionPaths) {
    try {
      const files = await fs.readdir(sessionPath);
      const jsonFiles = files.filter(f => f.endsWith('.json'));
      
      for (const file of jsonFiles) {
        try {
          const filePath = path.join(sessionPath, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const sessionData = JSON.parse(content);
          
          // Extract prompts from session
          if (sessionData.messages && Array.isArray(sessionData.messages)) {
            for (let i = 0; i < sessionData.messages.length; i++) {
              const msg = sessionData.messages[i];
              if (msg.role === 'user') {
                const prompt: any = {
                  content: msg.content.substring(0, 200) + (msg.content.length > 200 ? '...' : ''),
                  timestamp: msg.timestamp
                };
                
                // Find the next assistant response
                if (i + 1 < sessionData.messages.length && sessionData.messages[i + 1].role === 'assistant') {
                  prompt.response = sessionData.messages[i + 1].content.substring(0, 100) + '...';
                }
                
                allPrompts.push(prompt);
              }
            }
          }
          
          // Also check for conversation format
          if (sessionData.conversation) {
            const conversation = sessionData.conversation;
            const userPrompts = conversation.match(/(?:Human:|User:)\s*([^\n]+)/g);
            if (userPrompts) {
              userPrompts.forEach((prompt: string) => {
                allPrompts.push({
                  content: prompt.replace(/^(Human:|User:)\s*/, '').substring(0, 200)
                });
              });
            }
          }
          
          sessionFiles.push(file);
        } catch {}
      }
    } catch {}
  }

  // Update info with found prompts
  info.prompts.count = allPrompts.length;
  info.prompts.recent = allPrompts.slice(-5).reverse(); // Last 5, most recent first
  
  // Add session history summary
  if (sessionFiles.length > 0) {
    info.sessionHistory = [{
      timestamp: new Date().toISOString(),
      prompts: allPrompts.length,
      filesChanged: info.changes.files.length
    }];
  }
}