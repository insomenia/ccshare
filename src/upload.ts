import axios from 'axios';
import { SessionData, ShareResponse } from './types.js';

const CCSHARE_API_URL = process.env.CCSHARE_API_URL || 'https://api.ccshare.io';

export async function uploadSession(sessionData: SessionData): Promise<string> {
  try {
    // In a real implementation, this would upload to the actual ccshare service
    // For now, we'll create a mock implementation
    
    // Generate a unique share ID
    const shareId = generateShareId();
    
    // In production, this would be an actual API call:
    /*
    const response = await axios.post(`${CCSHARE_API_URL}/api/shares`, {
      sessionData,
      expiresIn: '7d' // 7 days expiration by default
    }, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ccshare-cli/0.1.0'
      }
    });
    
    const shareResponse: ShareResponse = response.data;
    return `https://ccshare.io/s/${shareResponse.shareId}`;
    */
    
    // Mock implementation for development
    console.log('\n📤 Uploading session data...');
    console.log(`   - ${sessionData.prompts.length} prompts`);
    console.log(`   - ${sessionData.changes.length} file changes`);
    if (sessionData.thoughts && sessionData.thoughts.length > 0) {
      console.log(`   - ${sessionData.thoughts.length} thought blocks`);
    }
    
    // Simulate upload delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Return mock share URL
    return `https://ccshare.io/s/${shareId}`;
    
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 413) {
        throw new Error('Session data is too large to upload. Try removing some content.');
      }
      if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      throw new Error(`Upload failed: ${error.response?.data?.message || error.message}`);
    }
    throw new Error(`Failed to upload session: ${(error as Error).message}`);
  }
}

function generateShareId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let shareId = '';
  for (let i = 0; i < 8; i++) {
    shareId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return shareId;
}

export async function getShareUrl(shareId: string): Promise<string> {
  return `https://ccshare.io/s/${shareId}`;
}