import { escape } from 'html-escaper';
import { TechStack } from './tech-detector.js';

export interface HtmlData {
  promptsWithChanges: Array<{
    prompt: string;
    timestamp?: string;
    sourceFile?: string;
    fileDiffs: Array<{
      path: string;
      diff: string;
    }>;
  }>;
  sessionInfo?: {
    totalPrompts: number;
    timeRange?: string;
    sources?: string[];
  };
  techStack?: TechStack;
}

export function generateHtml(data: HtmlData): string {
  const { promptsWithChanges, sessionInfo, techStack } = data;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude Code Session - ${new Date().toLocaleString('ko-KR')}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #f5f5f5;
      color: #333;
      line-height: 1.6;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    
    header {
      background-color: #2c3e50;
      color: white;
      padding: 30px 0;
      margin-bottom: 30px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }
    
    header h1 {
      text-align: center;
      font-size: 2.5em;
      font-weight: 300;
    }
    
    .timestamp {
      text-align: center;
      margin-top: 10px;
      opacity: 0.8;
      font-size: 0.9em;
    }
    
    .section {
      background-color: white;
      border-radius: 8px;
      padding: 30px;
      margin-bottom: 30px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.05);
    }
    
    .section h2 {
      font-size: 1.8em;
      margin-bottom: 20px;
      color: #2c3e50;
      border-bottom: 2px solid #ecf0f1;
      padding-bottom: 10px;
    }
    
    .prompt-list {
      list-style: none;
    }
    
    .prompt-item {
      background-color: #ecf0f1;
      padding: 15px 20px;
      margin-bottom: 15px;
      border-radius: 5px;
      border-left: 4px solid #3498db;
    }
    
    .prompt-number {
      font-weight: bold;
      color: #3498db;
      margin-bottom: 5px;
    }
    
    .file-diff {
      margin-bottom: 30px;
    }
    
    .file-path {
      background-color: #34495e;
      color: white;
      padding: 10px 15px;
      border-radius: 5px 5px 0 0;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-size: 0.9em;
    }
    
    .diff-content {
      background-color: #f8f8f8;
      border: 1px solid #ddd;
      border-top: none;
      border-radius: 0 0 5px 5px;
      overflow-x: auto;
    }
    
    .diff-line {
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-size: 0.85em;
      line-height: 1.4;
      white-space: pre;
      padding: 0 10px;
    }
    
    .diff-line.added {
      background-color: #e6ffed;
      color: #24292e;
    }
    
    .diff-line.removed {
      background-color: #ffeef0;
      color: #24292e;
    }
    
    .diff-line.header {
      background-color: #f6f8fa;
      color: #586069;
      padding: 5px 10px;
      font-weight: bold;
    }
    
    .diff-line.context {
      color: #586069;
    }
    
    .empty-state {
      text-align: center;
      color: #7f8c8d;
      font-style: italic;
      padding: 20px;
    }
    
    footer {
      text-align: center;
      color: #7f8c8d;
      padding: 30px 0;
      font-size: 0.9em;
    }
    
    .tech-stack {
      margin: 20px 0;
      padding: 20px;
      background-color: #f8f9fa;
      border-radius: 8px;
    }
    
    .tech-stack h3 {
      margin: 0 0 15px 0;
      font-size: 1.1em;
      color: #2c3e50;
    }
    
    .tech-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    
    .tech-tag {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 0.85em;
      font-weight: 500;
      white-space: nowrap;
    }
    
    .tech-tag.language {
      background-color: #3498db;
      color: white;
    }
    
    .tech-tag.framework {
      background-color: #e74c3c;
      color: white;
    }
    
    .tech-tag.tool {
      background-color: #2ecc71;
      color: white;
    }
    
    .tech-tag.database {
      background-color: #f39c12;
      color: white;
    }
  </style>
</head>
<body>
  <header>
    <div class="container">
      <h1>Claude Code Session Report</h1>
      <div class="timestamp">${new Date().toLocaleString('ko-KR')}</div>
      ${sessionInfo ? `
        <div style="margin-top: 15px; font-size: 0.9em; opacity: 0.9;">
          <div>• 총 ${sessionInfo.totalPrompts}개의 프롬프트</div>
          ${sessionInfo.timeRange ? `<div>• 기간: ${sessionInfo.timeRange}</div>` : ''}
          ${sessionInfo.sources && sessionInfo.sources.length > 0 ? `<div>• 소스: ${sessionInfo.sources.join(', ')}</div>` : ''}
        </div>
      ` : ''}
    </div>
  </header>
  
  <div class="container">
    ${techStack && (techStack.languages.length > 0 || techStack.frameworks.length > 0 || techStack.tools.length > 0 || techStack.databases.length > 0) ? `
      <div class="tech-stack">
        <h3>🔧 기술 스택</h3>
        <div class="tech-tags">
          ${techStack.languages.map(lang => `<span class="tech-tag language">${escape(lang)}</span>`).join('')}
          ${techStack.frameworks.map(fw => `<span class="tech-tag framework">${escape(fw)}</span>`).join('')}
          ${techStack.tools.map(tool => `<span class="tech-tag tool">${escape(tool)}</span>`).join('')}
          ${techStack.databases.map(db => `<span class="tech-tag database">${escape(db)}</span>`).join('')}
        </div>
      </div>
    ` : ''}
    
    <div class="section">
      <h2>프롬프트 및 변경사항 (${promptsWithChanges.length}개)</h2>
      ${promptsWithChanges.length > 0 ? `
        ${promptsWithChanges.map((item, index) => `
          <div style="margin-bottom: 40px;">
            <div class="prompt-item">
              <div class="prompt-number">프롬프트 #${index + 1}</div>
              <div>${escape(item.prompt)}</div>
              ${item.timestamp || item.sourceFile ? `
                <div style="margin-top: 8px; font-size: 0.85em; color: #666;">
                  ${item.timestamp ? `<span>🕒 ${new Date(item.timestamp).toLocaleString('ko-KR')}</span>` : ''}
                  ${item.sourceFile ? `<span style="margin-left: 15px;">📄 ${escape(item.sourceFile)}</span>` : ''}
                </div>
              ` : ''}
            </div>
            ${item.fileDiffs.length > 0 ? `
              <div style="margin-top: 20px; margin-left: 20px;">
                <h3 style="font-size: 1.2em; margin-bottom: 15px; color: #555;">변경된 파일 (${item.fileDiffs.length}개)</h3>
                ${item.fileDiffs.map(file => {
                  const parsedLines = parseDiff(file.diff);
                  return `
                    <div class="file-diff">
                      <div class="file-path">${escape(file.path)}</div>
                      <div class="diff-content">
                        ${parsedLines.map(line => 
                          `<div class="diff-line ${line.type}">${escape(line.content)}</div>`
                        ).join('')}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            ` : `
              <div style="margin-top: 15px; margin-left: 20px; color: #999; font-style: italic;">
                이 프롬프트에 대한 파일 변경사항이 없습니다
              </div>
            `}
          </div>
        `).join('')}
      ` : '<div class="empty-state">프롬프트가 없습니다</div>'}
    </div>
  </div>
  
  <footer>
    <div class="container">
      Generated by ccshare
    </div>
  </footer>
</body>
</html>`;
}

function parseDiff(diff: string): Array<{type: string; content: string}> {
  const lines = diff.split('\n');
  const result: Array<{type: string; content: string}> = [];
  
  for (const line of lines) {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff') || line.startsWith('index')) {
      result.push({ type: 'header', content: line });
    } else if (line.startsWith('@@')) {
      result.push({ type: 'header', content: line });
    } else if (line.startsWith('+')) {
      result.push({ type: 'added', content: line });
    } else if (line.startsWith('-')) {
      result.push({ type: 'removed', content: line });
    } else {
      result.push({ type: 'context', content: line });
    }
  }
  
  return result;
}