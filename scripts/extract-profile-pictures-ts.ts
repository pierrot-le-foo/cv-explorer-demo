#!/usr/bin/env tsx

import { promises as fs } from 'fs';
import path from 'path';
import { getResumes } from '@/lib/actions/resumes';
import sharp from 'sharp';
import pdfImgConvert from 'pdf-img-convert';

/**
 * TypeScript-based profile picture extraction for Next.js compatibility
 * This script can be used both as a standalone tool and integrated into Next.js API routes
 */

export interface ProfileExtractionResult {
  resumeId: string;
  fileName: string;
  success: boolean;
  fullPageImagePath?: string;
  profilePicturePath?: string;
  thumbnailPath?: string;
  error?: string;
  metadata?: {
    originalSize: { width: number; height: number };
    profileRegion: { x: number; y: number; width: number; height: number };
    confidence: number;
  };
}

export interface ExtractionConfig {
  outputDirs: {
    profilePictures: string;
    resumePreviews: string;
    thumbnails: string;
    temp: string;
  };
  conversion: {
    density: number;
    format: 'jpeg' | 'png';
    quality: number;
    maxWidth: number;
    maxHeight: number;
  };
  profileDetection: {
    regions: Array<{
      name: string;
      x: number; // percentage from left
      y: number; // percentage from top
      width: number; // percentage of total width
      height: number; // percentage of total height
      priority: number; // higher = more likely to contain profile pic
    }>;
    targetSize: { width: number; height: number };
    thumbnailSize: { width: number; height: number };
  };
}

const DEFAULT_CONFIG: ExtractionConfig = {
  outputDirs: {
    profilePictures: path.join(process.cwd(), 'public', 'profile-pictures'),
    resumePreviews: path.join(process.cwd(), 'public', 'resume-previews'),
    thumbnails: path.join(process.cwd(), 'public', 'thumbnails'),
    temp: path.join(process.cwd(), 'temp', 'pdf-processing')
  },
  conversion: {
    density: 200,
    format: 'png',
    quality: 95,
    maxWidth: 1200,
    maxHeight: 1600
  },
  profileDetection: {
    regions: [
      { name: 'top_right', x: 0.65, y: 0, width: 0.35, height: 0.4, priority: 10 },
      { name: 'top_left', x: 0, y: 0, width: 0.35, height: 0.4, priority: 8 },
      { name: 'center_right', x: 0.7, y: 0.1, width: 0.3, height: 0.4, priority: 7 },
      { name: 'top_center', x: 0.3, y: 0, width: 0.4, height: 0.3, priority: 5 }
    ],
    targetSize: { width: 300, height: 300 },
    thumbnailSize: { width: 150, height: 150 }
  }
};

export class ProfilePictureExtractor {
  private config: ExtractionConfig;
  
  constructor(config: Partial<ExtractionConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      outputDirs: { ...DEFAULT_CONFIG.outputDirs, ...config.outputDirs },
      conversion: { ...DEFAULT_CONFIG.conversion, ...config.conversion },
      profileDetection: { ...DEFAULT_CONFIG.profileDetection, ...config.profileDetection }
    };
  }

  /**
   * Create necessary directories
   */
  async createDirectories(): Promise<void> {
    const dirs = Object.values(this.config.outputDirs);
    
    for (const dir of dirs) {
      try {
        await fs.access(dir);
      } catch {
        await fs.mkdir(dir, { recursive: true });
        console.log(`📁 Created directory: ${path.relative(process.cwd(), dir)}`);
      }
    }
  }

  /**
   * Convert PDF to image using pdf-img-convert (works on all platforms)
   */
  async convertPdfToImage(pdfPath: string, resumeId: string): Promise<string | null> {
    try {
      // Convert only the first page
      const pdfArray = await pdfImgConvert.convert(pdfPath, {
        page_numbers: [1],
        base64: false,
        width: this.config.conversion.maxWidth,
        height: this.config.conversion.maxHeight
      });

      if (pdfArray && pdfArray.length > 0) {
        // Save the image buffer to a file
        const imagePath = path.join(this.config.outputDirs.temp, `${resumeId}.png`);
        await fs.writeFile(imagePath, pdfArray[0] as Buffer);
        
        console.log(`📄 Converted PDF to image: ${resumeId}`);
        return imagePath;
      }
      
      return null;
    } catch (error) {
      console.error(`❌ Error converting PDF ${resumeId}:`, error);
      return null;
    }
  }

  /**
   * Process image to extract profile picture and create previews
   */
  async processImage(imagePath: string, resumeId: string): Promise<{
    fullPagePath: string;
    profilePicturePath: string | null;
    thumbnailPath: string;
    metadata: any;
  }> {
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    
    if (!metadata.width || !metadata.height) {
      throw new Error('Invalid image metadata');
    }

    // Create full page preview (resized to fit web display)
    const fullPagePath = path.join(this.config.outputDirs.resumePreviews, `${resumeId}.${this.config.conversion.format}`);
    await image
      .resize(this.config.conversion.maxWidth, this.config.conversion.maxHeight, { 
        fit: 'inside',
        withoutEnlargement: true 
      })
      .png({ quality: this.config.conversion.quality })
      .toFile(fullPagePath);

    // Create thumbnail
    const thumbnailPath = path.join(this.config.outputDirs.thumbnails, `${resumeId}.${this.config.conversion.format}`);
    await image
      .resize(this.config.profileDetection.thumbnailSize.width, this.config.profileDetection.thumbnailSize.height, { 
        fit: 'cover',
        position: 'top'
      })
      .png({ quality: 85 })
      .toFile(thumbnailPath);

    // Extract profile picture from best region
    const profileResult = await this.extractProfilePicture(image, resumeId, metadata);

    return {
      fullPagePath: path.relative(process.cwd(), fullPagePath),
      profilePicturePath: profileResult.path,
      thumbnailPath: path.relative(process.cwd(), thumbnailPath),
      metadata: {
        originalSize: { width: metadata.width, height: metadata.height },
        profileRegion: profileResult.region,
        confidence: profileResult.confidence
      }
    };
  }

  /**
   * Extract profile picture by analyzing multiple regions
   */
  async extractProfilePicture(
    image: sharp.Sharp, 
    resumeId: string, 
    metadata: sharp.Metadata
  ): Promise<{
    path: string | null;
    region: { x: number; y: number; width: number; height: number };
    confidence: number;
  }> {
    const { width, height } = metadata;
    if (!width || !height) {
      throw new Error('Invalid image dimensions');
    }

    let bestRegion = null;
    let bestConfidence = 0;
    let bestRegionInfo = null;

    // Analyze each potential profile picture region
    for (const region of this.config.profileDetection.regions) {
      const x = Math.round(width * region.x);
      const y = Math.round(height * region.y);
      const regionWidth = Math.round(width * region.width);
      const regionHeight = Math.round(height * region.height);

      try {
        // Extract region for analysis
        const regionBuffer = await image
          .extract({ left: x, top: y, width: regionWidth, height: regionHeight })
          .png()
          .toBuffer();

        // Analyze region quality
        const confidence = await this.analyzeRegionForProfile(regionBuffer, region.priority);
        
        if (confidence > bestConfidence) {
          bestConfidence = confidence;
          bestRegion = regionBuffer;
          bestRegionInfo = { x, y, width: regionWidth, height: regionHeight };
        }
      } catch (error) {
        console.warn(`⚠️  Failed to extract region ${region.name} for ${resumeId}:`, error);
      }
    }

    // Save the best profile picture candidate
    if (bestRegion && bestConfidence > 0.3) {
      const profilePicturePath = path.join(this.config.outputDirs.profilePictures, `${resumeId}.png`);
      
      // Enhance and resize the profile picture
      await sharp(bestRegion)
        .resize(this.config.profileDetection.targetSize.width, this.config.profileDetection.targetSize.height, {
          fit: 'cover',
          position: 'center'
        })
        .sharpen()
        .png({ quality: 95 })
        .toFile(profilePicturePath);

      console.log(`🖼️  Extracted profile picture: ${resumeId}.png (confidence: ${bestConfidence.toFixed(2)})`);
      
      return {
        path: path.relative(process.cwd(), profilePicturePath),
        region: bestRegionInfo!,
        confidence: bestConfidence
      };
    }

    return {
      path: null,
      region: { x: 0, y: 0, width: 0, height: 0 },
      confidence: 0
    };
  }

  /**
   * Analyze a region to determine if it likely contains a profile picture
   */
  async analyzeRegionForProfile(regionBuffer: Buffer, basePriority: number): Promise<number> {
    try {
      const image = sharp(regionBuffer);
      const metadata = await image.metadata();
      const { width, height } = metadata;
      
      if (!width || !height) return 0;

      let score = basePriority / 10; // Base score from region priority

      // Size analysis
      const minSize = 100;
      const maxSize = 600;
      if (width >= minSize && height >= minSize && width <= maxSize && height <= maxSize) {
        score += 0.2;
      }

      // Aspect ratio analysis (profile pics tend to be square-ish)
      const aspectRatio = width / height;
      if (aspectRatio >= 0.7 && aspectRatio <= 1.4) {
        score += 0.3;
      }

      // Contrast analysis (faces have good contrast)
      const stats = await image.stats();
      const contrast = stats.channels.reduce((sum, channel) => sum + channel.stdev, 0) / stats.channels.length;
      if (contrast > 20 && contrast < 80) {
        score += 0.2;
      }

      // Edge detection (faces have distinct features)
      const edges = await image.convolve({
        width: 3,
        height: 3,
        kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
      }).raw().toBuffer();
      
      const edgeIntensity = Array.from(edges).reduce((sum, val) => sum + val, 0) / edges.length;
      if (edgeIntensity > 10 && edgeIntensity < 50) {
        score += 0.2;
      }

      return Math.min(score, 1.0);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Process a single resume (can be used in API routes)
   */
  async processResume(resumeId: string, pdfPath: string): Promise<ProfileExtractionResult> {
    try {
      await this.createDirectories();

      // Convert PDF to image
      const imagePath = await this.convertPdfToImage(pdfPath, resumeId);
      if (!imagePath) {
        return {
          resumeId,
          fileName: path.basename(pdfPath),
          success: false,
          error: 'Failed to convert PDF to image'
        };
      }

      // Process image
      const result = await this.processImage(imagePath, resumeId);

      // Clean up temp file
      try {
        await fs.unlink(imagePath);
      } catch {
        // Ignore cleanup errors
      }

      return {
        resumeId,
        fileName: path.basename(pdfPath),
        success: true,
        fullPageImagePath: result.fullPagePath,
        profilePicturePath: result.profilePicturePath || undefined,
        thumbnailPath: result.thumbnailPath,
        metadata: result.metadata
      };

    } catch (error) {
      return {
        resumeId,
        fileName: path.basename(pdfPath),
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Process all resumes from database (for batch processing)
   */
  async processAllResumes(): Promise<ProfileExtractionResult[]> {
    console.log('🚀 Starting profile picture extraction process...');
    
    await this.createDirectories();
    
    // Fetch all resumes from database
    console.log('📊 Fetching resumes from database...');
    const resumes = await getResumes();
    console.log(`📊 Found ${resumes.length} resumes in database`);
    
    const results: ProfileExtractionResult[] = [];
    let successCount = 0;
    let errorCount = 0;
    
    // Process each resume
    for (const resume of resumes) {
      console.log(`\n🔄 Processing: ${resume.id}`);
      
      // Get the PDF file path
      const sourceFileName = (resume.cmetadata as any).source;
      if (!sourceFileName) {
        results.push({
          resumeId: resume.id,
          fileName: 'unknown',
          success: false,
          error: 'No source filename in metadata'
        });
        errorCount++;
        continue;
      }
      
      const pdfPath = path.join(process.cwd(), 'resumes', sourceFileName);
      
      // Check if PDF exists
      try {
        await fs.access(pdfPath);
      } catch {
        results.push({
          resumeId: resume.id,
          fileName: sourceFileName,
          success: false,
          error: 'PDF file not found'
        });
        errorCount++;
        continue;
      }
      
      // Process the resume
      const result = await this.processResume(resume.id, pdfPath);
      results.push(result);
      
      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }
    }
    
    // Generate summary report
    console.log('\n📋 Extraction Summary:');
    console.log(`✅ Successfully processed: ${successCount} resumes`);
    console.log(`❌ Failed: ${errorCount} resumes`);
    console.log(`📁 Full page images: ${path.relative(process.cwd(), this.config.outputDirs.resumePreviews)}`);
    console.log(`📁 Profile pictures: ${path.relative(process.cwd(), this.config.outputDirs.profilePictures)}`);
    console.log(`📁 Thumbnails: ${path.relative(process.cwd(), this.config.outputDirs.thumbnails)}`);
    
    // Save detailed results to JSON
    const reportPath = path.join(process.cwd(), 'profile-picture-extraction-report.json');
    await fs.writeFile(reportPath, JSON.stringify(results, null, 2));
    console.log(`📊 Detailed report: ${path.relative(process.cwd(), reportPath)}`);
    
    console.log('\n🎉 Profile picture extraction completed!');
    return results;
  }

  /**
   * Clean up all extracted files
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up extracted files...');
    
    let cleanupCount = 0;
    const dirs = Object.values(this.config.outputDirs);
    
    for (const dir of dirs) {
      try {
        const files = await fs.readdir(dir);
        for (const file of files) {
          if (file.match(/\.(png|jpg|jpeg)$/i)) {
            await fs.unlink(path.join(dir, file));
            cleanupCount++;
          }
        }
      } catch {
        // Directory might not exist
      }
    }
    
    console.log(`🧹 Cleaned up ${cleanupCount} files`);
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const extractor = new ProfilePictureExtractor();
  
  if (args.includes('--cleanup') || args.includes('-c')) {
    extractor.cleanup();
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Profile Picture Extraction Script (TypeScript)

Usage:
  tsx scripts/extract-profile-pictures-ts.ts           Extract profile pictures
  tsx scripts/extract-profile-pictures-ts.ts --cleanup Clean up extracted files
  tsx scripts/extract-profile-pictures-ts.ts --help    Show this help

Description:
  TypeScript-based profile picture extraction compatible with Next.js.
  Creates full page previews, thumbnails, and profile picture candidates.

Features:
  - PDF to image conversion using pdf-poppler
  - Image processing with Sharp
  - Multiple region analysis for profile detection
  - Next.js API route compatible
  - Configurable extraction parameters

Output:
  - public/resume-previews/: Full page resume images
  - public/profile-pictures/: Extracted profile picture candidates  
  - public/thumbnails/: Small preview thumbnails
  - profile-picture-extraction-report.json: Detailed processing report
    `);
  } else {
    extractor.processAllResumes();
  }
}

// Export for use in Next.js
export default ProfilePictureExtractor;
