import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export async function createAutoPostForm(data: any, apiUrl: string): Promise<string> {
  // Create a temporary HTML file with an auto-submitting form
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Sharing to ccshare...</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background-color: #1a1a1a;
      color: #e5e5e5;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: #2a2a2a;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      border: 1px solid #3a3a3a;
    }
    h2 {
      color: #f5f5f5;
      margin-bottom: 20px;
    }
    p {
      color: #b5b5b5;
    }
    .spinner {
      border: 3px solid #3a3a3a;
      border-top: 3px solid #fb923c;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 20px auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="container">
    <h2>Sharing to ccshare...</h2>
    <div class="spinner"></div>
    <p>Please wait while we redirect you.</p>
  </div>
  
  <form id="postForm" action="${apiUrl}" method="POST" style="display: none;">
    <input type="hidden" name="data" value='${JSON.stringify(data).replace(/'/g, '&#39;')}'>
  </form>
  
  <script>
    // Auto-submit the form
    document.getElementById('postForm').submit();
  </script>
</body>
</html>`;

  // Create temp file
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `ccshare-post-${Date.now()}.html`);
  await fs.writeFile(tempFile, html, 'utf-8');
  
  // Schedule deletion after 10 seconds
  setTimeout(async () => {
    try {
      await fs.unlink(tempFile);
    } catch {
      // Ignore if already deleted
    }
  }, 10000);
  
  return tempFile;
}

export async function createApiPostRequest(data: any, apiUrl: string): Promise<string> {
  // Alternative: Create URL with data in query params for API to handle
  const encodedData = Buffer.from(JSON.stringify(data)).toString('base64');
  const submitUrl = `${apiUrl}?action=submit&data=${encodedData}`;
  
  // Truncate if URL is too long
  if (submitUrl.length > 2000) {
    // For large data, use session storage approach
    return createAutoPostForm(data, apiUrl);
  }
  
  return submitUrl;
}