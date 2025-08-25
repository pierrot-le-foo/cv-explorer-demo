import ProfilePictureExtractor, { type ProfileExtractionResult } from '@/scripts/extract-profile-pictures-puppeteer';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Next.js-compatible API functions for profile picture extraction
 * These functions can be used in API routes for real-time processing
 */

/**
 * Process a single PDF file and extract profile picture
 * This function is designed to be used in Next.js API routes
 */
export async function extractProfileFromPDF(
  pdfBuffer: Buffer,
  resumeId: string,
  originalFileName: string
): Promise<ProfileExtractionResult> {
  const extractor = new ProfilePictureExtractor();
  
  try {
    // Create temp directory if it doesn't exist
    const tempDir = path.join(process.cwd(), 'temp', 'uploads');
    await fs.mkdir(tempDir, { recursive: true });
    
    // Save buffer to temporary file
    const tempPdfPath = path.join(tempDir, `${resumeId}.pdf`);
    await fs.writeFile(tempPdfPath, pdfBuffer);
    
    // Process the PDF
    const result = await extractor.processResume(resumeId, tempPdfPath);
    
    // Clean up temp file
    try {
      await fs.unlink(tempPdfPath);
    } catch {
      // Ignore cleanup errors
    }
    
    return result;
  } catch (error) {
    return {
      resumeId,
      fileName: originalFileName,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Process uploaded file from FormData (for file upload handling)
 */
export async function extractProfileFromUpload(
  file: File,
  resumeId: string
): Promise<ProfileExtractionResult> {
  try {
    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    return await extractProfileFromPDF(buffer, resumeId, file.name);
  } catch (error) {
    return {
      resumeId,
      fileName: file.name,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Get the public URL for an extracted file
 */
export function getProfilePictureUrl(resumeId: string): string {
  return `/profile-pictures/${resumeId}.png`;
}

export function getResumePreviewUrl(resumeId: string): string {
  return `/resume-previews/${resumeId}.png`;
}

export function getThumbnailUrl(resumeId: string): string {
  return `/thumbnails/${resumeId}.png`;
}

/**
 * Check if profile picture exists for a resume
 */
export async function hasProfilePicture(resumeId: string): Promise<boolean> {
  try {
    const profilePath = path.join(process.cwd(), 'public', 'profile-pictures', `${resumeId}.png`);
    await fs.access(profilePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if resume preview exists
 */
export async function hasResumePreview(resumeId: string): Promise<boolean> {
  try {
    const previewPath = path.join(process.cwd(), 'public', 'resume-previews', `${resumeId}.png`);
    await fs.access(previewPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Batch process multiple resumes (for background jobs)
 */
export async function batchExtractProfiles(resumeIds: string[]): Promise<ProfileExtractionResult[]> {
  const extractor = new ProfilePictureExtractor();
  const results: ProfileExtractionResult[] = [];
  
  for (const resumeId of resumeIds) {
    try {
      // Assuming PDFs are in the public/resumes directory
      const pdfPath = path.join(process.cwd(), 'public', 'resumes', `${resumeId}.pdf`);
      const result = await extractor.processResume(resumeId, pdfPath);
      results.push(result);
    } catch (error) {
      results.push({
        resumeId,
        fileName: `${resumeId}.pdf`,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  return results;
}
