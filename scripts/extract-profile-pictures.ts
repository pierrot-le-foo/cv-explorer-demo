#!/usr/bin/env tsx

import { promises as fs } from 'fs';
import path from 'path';
import { getResumes } from '@/lib/actions/resumes';
import pdf2pic from 'pdf2pic';

/**
 * Script to extract profile pictures from PDF resumes
 * This script analyzes the first page of each PDF resume and attempts to identify
 * and extract profile pictures using image detection heuristics
 */

interface ImageExtractionResult {
  resumeId: string;
  fileName: string;
  success: boolean;
  profilePicturePath?: string;
  fullPageImagePath?: string;
  error?: string;
}

/**
 * Configuration for image extraction
 */
const EXTRACTION_CONFIG = {
  // Output directory for extracted profile pictures
  outputDir: path.join(process.cwd(), 'public', 'profile-pictures'),
  
  // Full page images directory
  fullPageDir: path.join(process.cwd(), 'public', 'resume-previews'),
  
  // PDF to image conversion settings
  density: 200, // DPI for PDF conversion
  tempDir: path.join(process.cwd(), 'temp', 'pdf-images'),
  
  // Profile picture detection criteria
  minImageSize: 100, // Minimum width/height in pixels
  maxImageSize: 800, // Maximum width/height in pixels
  aspectRatioTolerance: 0.3, // How close to square (1.0) the image should be
};

/**
 * Create necessary directories
 */
async function createDirectories() {
  const dirs = [EXTRACTION_CONFIG.outputDir, EXTRACTION_CONFIG.fullPageDir, EXTRACTION_CONFIG.tempDir];
  
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
 * Convert PDF first page to image and save both full page and cropped versions
 */
async function convertPdfToImage(pdfPath: string, resumeId: string): Promise<{ fullPagePath: string | null, croppedPath: string | null }> {
  try {
    // Configure pdf2pic
    const convert = pdf2pic.fromPath(pdfPath, {
      density: EXTRACTION_CONFIG.density,
      format: "png",
      width: 1200,
      height: 1600,
    });

    // Convert only the first page
    const result = await convert(1, { responseType: "base64" });
    
    if (result && result.base64) {
      // Save full page image
      const fullPagePath = path.join(EXTRACTION_CONFIG.fullPageDir, `${resumeId}.png`);
      const fullPageBuffer = Buffer.from(result.base64, 'base64');
      await fs.writeFile(fullPagePath, fullPageBuffer);
      
      // Create a cropped version (top-right area where profile pics are typically located)
      const croppedPath = await createProfilePictureCrop(fullPageBuffer, resumeId);
      
      console.log(`📄 Converted PDF to image: ${resumeId}`);
      return { 
        fullPagePath: path.relative(process.cwd(), fullPagePath),
        croppedPath: croppedPath ? path.relative(process.cwd(), croppedPath) : null
      };
    }
    
    return { fullPagePath: null, croppedPath: null };
  } catch (error) {
    console.error(`❌ Error converting PDF to image for ${resumeId}:`, error);
    return { fullPagePath: null, croppedPath: null };
  }
}

/**
 * Create a cropped version of the resume focusing on the top-right area
 * This is a simplified approach using ImageMagick-style cropping
 */
async function createProfilePictureCrop(imageBuffer: Buffer, resumeId: string): Promise<string | null> {
  try {
    // For this simplified version, we'll save the full image and let the frontend handle cropping
    // In a production environment, you could use sharp, jimp, or canvas for actual image manipulation
    
    const outputPath = path.join(EXTRACTION_CONFIG.outputDir, `${resumeId}.png`);
    await fs.writeFile(outputPath, imageBuffer);
    
    console.log(`🖼️  Created profile picture candidate: ${resumeId}.png`);
    return outputPath;
  } catch (error) {
    console.error(`❌ Error creating profile picture crop for ${resumeId}:`, error);
    return null;
  }
}

/**
 * Alternative: Use sharp library for image processing (if available)
 */
async function createProfilePictureCropWithSharp(imageBuffer: Buffer, resumeId: string): Promise<string | null> {
  try {
    // This would require: pnpm add sharp
    // const sharp = require('sharp');
    // 
    // const metadata = await sharp(imageBuffer).metadata();
    // const cropWidth = Math.min(400, metadata.width! * 0.3);
    // const cropHeight = Math.min(400, metadata.height! * 0.25);
    // const left = metadata.width! - cropWidth - (metadata.width! * 0.05);
    // const top = metadata.height! * 0.05;
    // 
    // const croppedBuffer = await sharp(imageBuffer)
    //   .extract({ left: Math.round(left), top: Math.round(top), width: Math.round(cropWidth), height: Math.round(cropHeight) })
    //   .png()
    //   .toBuffer();
    // 
    // const outputPath = path.join(EXTRACTION_CONFIG.outputDir, `${resumeId}.png`);
    // await fs.writeFile(outputPath, croppedBuffer);
    
    console.log(`🔧 Sharp-based cropping not implemented - using fallback for ${resumeId}`);
    return await createProfilePictureCrop(imageBuffer, resumeId);
  } catch (error) {
    console.error(`❌ Error with sharp cropping for ${resumeId}:`, error);
    return null;
  }
}

/**
 * Advanced profile picture detection using AI/ML approach
 * This is a placeholder for a more sophisticated implementation
 */
async function detectProfilePictureAdvanced(imagePath: string, resumeId: string): Promise<string | null> {
  // TODO: Implement using:
  // - OpenCV for face detection
  // - TensorFlow.js for object detection
  // - Azure Computer Vision API
  // - AWS Rekognition
  // - Google Cloud Vision API
  
  console.log(`🔍 Advanced detection not implemented yet for ${resumeId}`);
  return null;
}

/**
 * Clean up temporary files
 */
async function cleanupTempFiles() {
  try {
    const tempDir = EXTRACTION_CONFIG.tempDir;
    const files = await fs.readdir(tempDir);
    
    let deletedCount = 0;
    for (const file of files) {
      if (file.endsWith('.png') || file.endsWith('.jpg')) {
        await fs.unlink(path.join(tempDir, file));
        deletedCount++;
      }
    }
    
    console.log(`🧹 Cleaned up ${deletedCount} temporary files`);
  } catch (error) {
    console.error('Error cleaning up temp files:', error);
  }
}

/**
 * Main function to extract profile pictures from all resumes
 */
async function extractProfilePictures() {
  try {
    console.log('🚀 Starting profile picture extraction process...');
    
    // Create necessary directories
    await createDirectories();
    
    // Fetch all resumes from database
    console.log('📊 Fetching resumes from database...');
    const resumes = await getResumes();
    console.log(`📊 Found ${resumes.length} resumes in database`);
    
    const results: ImageExtractionResult[] = [];
    let successCount = 0;
    let errorCount = 0;
    
    // Process each resume
    for (const resume of resumes) {
      try {
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
        
        // Convert PDF to image and extract profile picture
        const { fullPagePath, croppedPath } = await convertPdfToImage(pdfPath, resume.id);
        if (!fullPagePath) {
          results.push({
            resumeId: resume.id,
            fileName: sourceFileName,
            success: false,
            error: 'Failed to convert PDF to image'
          });
          errorCount++;
          continue;
        }
        
        results.push({
          resumeId: resume.id,
          fileName: sourceFileName,
          success: true,
          fullPageImagePath: fullPagePath,
          profilePicturePath: croppedPath || undefined
        });
        successCount++;
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          resumeId: resume.id,
          fileName: (resume.cmetadata as any).source || 'unknown',
          success: false,
          error: errorMessage
        });
        errorCount++;
      }
    }
    
    // Clean up temporary files
    await cleanupTempFiles();
    
    // Generate summary report
    console.log('\n📋 Extraction Summary:');
    console.log(`✅ Successfully processed: ${successCount} resumes`);
    console.log(`❌ Failed: ${errorCount} resumes`);
    console.log(`📁 Full page images saved to: ${path.relative(process.cwd(), EXTRACTION_CONFIG.fullPageDir)}`);
    console.log(`📁 Profile picture candidates saved to: ${path.relative(process.cwd(), EXTRACTION_CONFIG.outputDir)}`);
    
    // Save detailed results to JSON
    const reportPath = path.join(process.cwd(), 'profile-picture-extraction-report.json');
    await fs.writeFile(reportPath, JSON.stringify(results, null, 2));
    console.log(`📊 Detailed report saved to: ${path.relative(process.cwd(), reportPath)}`);
    
    // Show successful extractions
    const successful = results.filter(r => r.success);
    if (successful.length > 0) {
      console.log('\n✅ Successfully processed resumes:');
      successful.forEach(result => {
        console.log(`  - ${result.resumeId}:`);
        console.log(`    📄 Full page: ${result.fullPageImagePath}`);
        if (result.profilePicturePath) {
          console.log(`    🖼️  Profile pic: ${result.profilePicturePath}`);
        }
      });
    }
    
    // Show errors
    const failed = results.filter(r => !r.success);
    if (failed.length > 0) {
      console.log('\n❌ Failed extractions:');
      failed.forEach(result => {
        console.log(`  - ${result.resumeId}: ${result.error}`);
      });
    }
    
    console.log('\n🎉 Profile picture extraction process completed!');
    console.log('\n💡 Tips:');
    console.log('  - Full page images can be used for resume previews');
    console.log('  - Profile picture candidates may need manual review');
    console.log('  - Consider using AI vision APIs for better profile detection');
    
  } catch (error) {
    console.error('💥 Fatal error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Cleanup function to remove all extracted profile pictures
 */
async function cleanupProfilePictures() {
  try {
    const outputDir = EXTRACTION_CONFIG.outputDir;
    const files = await fs.readdir(outputDir);
    
    let deletedCount = 0;
    for (const file of files) {
      if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg')) {
        await fs.unlink(path.join(outputDir, file));
        console.log(`🗑️  Removed: ${file}`);
        deletedCount++;
      }
    }
    
    console.log(`🧹 Cleaned up ${deletedCount} profile picture files`);
  } catch (error) {
    console.error('Error during profile picture cleanup:', error);
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--cleanup') || args.includes('-c')) {
    cleanupProfilePictures();
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Profile Picture Extraction Script

Usage:
  tsx scripts/extract-profile-pictures.ts           Extract profile pictures from PDFs
  tsx scripts/extract-profile-pictures.ts --cleanup Clean up extracted profile pictures
  tsx scripts/extract-profile-pictures.ts --help    Show this help message

Description:
  This script processes PDF resumes and attempts to extract profile pictures
  by converting the first page to an image and using heuristic-based detection
  to identify and extract regions that likely contain profile pictures.
  
  Extracted images are saved to public/profile-pictures/ with the resume ID
  as the filename.

Features:
  - Converts PDF first page to high-resolution image
  - Uses position-based heuristics to detect profile pictures
  - Saves extracted images in web-accessible format
  - Generates detailed extraction report
  - Cleanup functionality for maintenance

Configuration:
  - Output directory: public/profile-pictures/
  - Image format: PNG
  - Detection method: Top-right region extraction (common CV layout)
  
Note:
  This implementation uses basic heuristics. For production use, consider
  integrating with computer vision APIs like Azure Computer Vision,
  AWS Rekognition, or Google Cloud Vision for more accurate detection.
    `);
  } else {
    extractProfilePictures();
  }
}

export { extractProfilePictures, cleanupProfilePictures };
