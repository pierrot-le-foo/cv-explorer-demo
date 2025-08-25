#!/usr/bin/env tsx

import { promises as fs } from 'fs';
import path from 'path';
import pdf2html from 'pdf2html';
import sharp from 'sharp';
import prisma from '../prisma/prisma';

interface ImageInfo {
  src: string;
  width: number;
  height: number;
  position: { x: number; y: number };
}

class HTMLProfilePictureExtractor {
  async convertPdfToHtml(pdfPath: string): Promise<string> {
    try {
      console.log(`🔄 Converting PDF to HTML: ${path.basename(pdfPath)}`);
      
      const options = {
        page: 1, // Only process first page
        word: false, // Don't extract individual words
        fontdatadir: path.join(process.cwd(), 'temp'),
        dest: path.join(process.cwd(), 'temp', 'html-output')
      };

      // Ensure temp directories exist
      await fs.mkdir(options.fontdatadir, { recursive: true });
      await fs.mkdir(options.dest, { recursive: true });

      const result = await pdf2html.html(pdfPath, options as any);
      
      console.log(`✅ PDF converted successfully`);
      return result;
    } catch (error) {
      console.error('❌ Error converting PDF to HTML:', error);
      throw error;
    }
  }

  async extractImagesFromHtml(htmlContent: string, outputDir: string): Promise<ImageInfo[]> {
    const images: ImageInfo[] = [];
    
    try {
      // Parse HTML to find image tags
      const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
      let match;

      while ((match = imgRegex.exec(htmlContent)) !== null) {
        const imgTag = match[0];
        const src = match[1];

        // Extract width and height if available
        const widthMatch = imgTag.match(/width=["']?(\d+)["']?/i);
        const heightMatch = imgTag.match(/height=["']?(\d+)["']?/i);
        const styleMatch = imgTag.match(/style=["']([^"']+)["']/i);

        let width = widthMatch ? parseInt(widthMatch[1]) : 0;
        let height = heightMatch ? parseInt(heightMatch[1]) : 0;
        let position = { x: 0, y: 0 };

        // Try to extract position from style
        if (styleMatch) {
          const style = styleMatch[1];
          const leftMatch = style.match(/left:\s*(\d+)px/);
          const topMatch = style.match(/top:\s*(\d+)px/);
          
          if (leftMatch) position.x = parseInt(leftMatch[1]);
          if (topMatch) position.y = parseInt(topMatch[1]);

          // Try to get dimensions from style if not in attributes
          const styleWidthMatch = style.match(/width:\s*(\d+)px/);
          const styleHeightMatch = style.match(/height:\s*(\d+)px/);
          
          if (styleWidthMatch && !width) width = parseInt(styleWidthMatch[1]);
          if (styleHeightMatch && !height) height = parseInt(styleHeightMatch[1]);
        }

        images.push({
          src,
          width,
          height,
          position
        });

        console.log(`🖼️  Found image: ${src} (${width}x${height}) at (${position.x}, ${position.y})`);
      }

      return images;
    } catch (error) {
      console.error('❌ Error extracting images from HTML:', error);
      return [];
    }
  }

  async identifyProfilePicture(images: ImageInfo[]): Promise<ImageInfo | null> {
    if (images.length === 0) {
      console.log('ℹ️  No images found in HTML');
      return null;
    }

    // Filter potential profile pictures based on common characteristics
    const candidates = images.filter(img => {
      // Profile pictures are usually:
      // 1. Square or portrait aspect ratio (height >= width)
      // 2. Not too small (likely decorative icons)
      // 3. Not too large (likely background or layout elements)
      // 4. Often positioned in the top portion of the page

      const aspectRatio = img.height > 0 ? img.width / img.height : 1;
      const isReasonableSize = img.width >= 50 && img.height >= 50 && img.width <= 300 && img.height <= 400;
      const isPortraitOrSquare = aspectRatio <= 1.2; // Allow slight rectangle
      const isInTopHalf = img.position.y <= 400; // Assuming page height ~800px

      console.log(`📊 Image analysis: ${img.src}`);
      console.log(`   Size: ${img.width}x${img.height} (aspect: ${aspectRatio.toFixed(2)})`);
      console.log(`   Position: (${img.position.x}, ${img.position.y})`);
      console.log(`   Reasonable size: ${isReasonableSize}`);
      console.log(`   Portrait/Square: ${isPortraitOrSquare}`);
      console.log(`   Top half: ${isInTopHalf}`);

      return isReasonableSize && isPortraitOrSquare && isInTopHalf;
    });

    if (candidates.length === 0) {
      console.log('ℹ️  No suitable profile picture candidates found');
      return null;
    }

    // Sort by area (larger images first) and position (higher on page first)
    candidates.sort((a, b) => {
      const areaA = a.width * a.height;
      const areaB = b.width * b.height;
      
      // Prefer larger images, but also consider position
      const scoreA = areaA - (a.position.y * 0.1);
      const scoreB = areaB - (b.position.y * 0.1);
      
      return scoreB - scoreA;
    });

    const bestCandidate = candidates[0];
    console.log(`🎯 Selected profile picture candidate: ${bestCandidate.src}`);
    return bestCandidate;
  }

  async copyImageFile(imagePath: string, outputPath: string, targetWidth = 200, targetHeight = 200): Promise<boolean> {
    try {
      // Check if the source image exists
      await fs.access(imagePath);

      console.log(`📋 Copying and resizing image: ${imagePath} -> ${outputPath}`);

      // Process with Sharp
      await sharp(imagePath)
        .resize(targetWidth, targetHeight, { 
          fit: 'cover',
          position: 'center'
        })
        .png()
        .toFile(outputPath);

      console.log(`✅ Image processed and saved: ${outputPath}`);
      return true;
    } catch (error) {
      console.error(`❌ Error copying image: ${error}`);
      return false;
    }
  }

  async processResume(resumeId: string, pdfPath: string): Promise<boolean> {
    try {
      console.log(`\n📄 Processing resume: ${resumeId}`);

      // Convert PDF to HTML
      const htmlContent = await this.convertPdfToHtml(pdfPath);

      // Extract images from HTML
      const images = await this.extractImagesFromHtml(htmlContent, path.join(process.cwd(), 'temp'));

      // Identify potential profile picture
      const profilePicture = await this.identifyProfilePicture(images);

      if (profilePicture) {
        // Construct the full path to the image
        const tempDir = path.join(process.cwd(), 'temp', 'html-output');
        const imagePath = path.resolve(tempDir, profilePicture.src);
        
        // Output path for the profile picture
        const profileOutputPath = path.join(process.cwd(), 'public', 'profiles', `${resumeId}.png`);
        
        // Ensure profiles directory exists
        await fs.mkdir(path.dirname(profileOutputPath), { recursive: true });

        // Copy and resize the image
        const success = await this.copyImageFile(imagePath, profileOutputPath);
        
        if (success) {
          console.log(`✅ Successfully extracted profile picture for ${resumeId}`);
          return true;
        }
      } else {
        console.log(`ℹ️  No profile picture found for ${resumeId}`);
      }

      return false;
    } catch (error) {
      console.error(`❌ Error processing resume ${resumeId}:`, error);
      return false;
    } finally {
      // Clean up temporary files
      await this.cleanupTempFiles();
    }
  }

  async cleanupTempFiles(): Promise<void> {
    try {
      const tempDir = path.join(process.cwd(), 'temp');
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

async function main() {
  const extractor = new HTMLProfilePictureExtractor();
  
  try {
    // Get all resumes from database
    const resumes = await prisma.resume.findMany({
      select: { id: true, cmetadata: true }
    });

    console.log(`📚 Found ${resumes.length} resumes to process`);

    let successCount = 0;
    let totalCount = 0;

    for (const resume of resumes) {
      totalCount++;
      
      if (resume.cmetadata && typeof resume.cmetadata === 'object' && 'source' in resume.cmetadata) {
        const pdfPath = path.join(process.cwd(), 'public', 'resumes', `${resume.id}.pdf`);
        
        // Check if PDF exists
        try {
          await fs.access(pdfPath);
          const success = await extractor.processResume(resume.id, pdfPath);
          if (success) successCount++;
        } catch {
          console.log(`⚠️  PDF not found for resume ${resume.id}, skipping...`);
        }
      } else {
        console.log(`⚠️  No source metadata for resume ${resume.id}, skipping...`);
      }
    }

    console.log(`\n🎉 Processing complete!`);
    console.log(`📊 Results: ${successCount}/${totalCount} profile pictures extracted`);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await extractor.cleanupTempFiles();
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

export { HTMLProfilePictureExtractor };
