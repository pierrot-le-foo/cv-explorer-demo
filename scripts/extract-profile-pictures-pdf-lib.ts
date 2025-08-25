#!/usr/bin/env tsx

import { promises as fs } from 'fs';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import prisma from '../prisma/prisma';

interface ExtractedImage {
  data: Uint8Array;
  width?: number;
  height?: number;
  format?: string;
}

class PDFImageExtractor {
  async extractImagesFromPDF(pdfPath: string): Promise<ExtractedImage[]> {
    try {
      console.log(`🔍 Extracting images from: ${path.basename(pdfPath)}`);
      
      const pdfBytes = await fs.readFile(pdfPath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      
      const pages = pdfDoc.getPages();
      const firstPage = pages[0];
      
      console.log(`📄 PDF has ${pages.length} pages, analyzing first page`);
      
      // Get all objects in the first page
      const pageRef = firstPage.ref;
      const pageDict = pdfDoc.context.lookup(pageRef);
      
      if (!pageDict) {
        console.log('ℹ️  No page dictionary found');
        return [];
      }
      
      // Look for XObject resources (which include images)
      const resources = (pageDict as any).get('Resources');
      if (!resources) {
        console.log('ℹ️  No resources found on page');
        return [];
      }
      
      const xObjects = resources.get('XObject');
      if (!xObjects) {
        console.log('ℹ️  No XObjects found in resources');
        return [];
      }
      
      const images: ExtractedImage[] = [];
      const xObjectNames = xObjects.keys();
      
      console.log(`🖼️  Found ${xObjectNames.length} XObjects to examine`);
      
      for (const name of xObjectNames) {
        try {
          const xObject = xObjects.get(name);
          const xObjectRef = pdfDoc.context.lookup(xObject);
          
          if (!xObjectRef) {
            console.log(`   ${name}: XObject not found`);
            continue;
          }
          
          // Check if this is an image XObject
          const subtype = (xObjectRef as any).get('Subtype');
          if (subtype?.toString() !== '/Image') {
            console.log(`   ${name}: Not an image (${subtype})`);
            continue;
          }
          
          const width = (xObjectRef as any).get('Width')?.asNumber();
          const height = (xObjectRef as any).get('Height')?.asNumber();
          const colorSpace = (xObjectRef as any).get('ColorSpace');
          const filter = (xObjectRef as any).get('Filter');
          
          console.log(`   ${name}: Image ${width}x${height}, filter: ${filter}, colorSpace: ${colorSpace}`);
          
          // Only process reasonable sized images (likely profile pictures)
          if (width && height && width >= 50 && height >= 50 && width <= 500 && height <= 500) {
            // Extract the image data
            const imageStream = (xObjectRef as any).asStream();
            const imageData = imageStream.contents;
            
            images.push({
              data: imageData,
              width,
              height,
              format: this.determineImageFormat(filter, imageData)
            });
            
            console.log(`   ✅ Extracted image: ${width}x${height} (${imageData.length} bytes)`);
          } else {
            console.log(`   ⏭️  Skipping image: size ${width}x${height} (outside target range)`);
          }
          
        } catch (error) {
          console.log(`   ❌ Error processing XObject ${name}:`, error instanceof Error ? error.message : 'Unknown error');
        }
      }
      
      console.log(`🎯 Found ${images.length} potential profile picture images`);
      return images;
      
    } catch (error) {
      console.error('❌ Error extracting images from PDF:', error);
      return [];
    }
  }

  determineImageFormat(filter: any, data: Uint8Array): string {
    if (filter) {
      const filterStr = filter.toString();
      if (filterStr.includes('DCTDecode')) return 'jpeg';
      if (filterStr.includes('JPXDecode')) return 'jp2';
      if (filterStr.includes('CCITTFaxDecode')) return 'tiff';
      if (filterStr.includes('JBIG2Decode')) return 'jbig2';
    }
    
    // Try to detect from magic bytes
    if (data.length >= 4) {
      const header = Array.from(data.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('');
      if (header.startsWith('ffd8')) return 'jpeg';
      if (header.startsWith('8950')) return 'png';
      if (header.startsWith('4749')) return 'gif';
    }
    
    return 'unknown';
  }

  async findBestProfilePicture(images: ExtractedImage[]): Promise<ExtractedImage | null> {
    if (images.length === 0) return null;
    
    // Score images based on characteristics typical of profile pictures
    const scoredImages = images.map(img => {
      let score = 0;
      
      if (img.width && img.height) {
        // Prefer square or portrait aspect ratios
        const aspectRatio = img.width / img.height;
        if (aspectRatio >= 0.8 && aspectRatio <= 1.2) score += 10; // Square
        else if (aspectRatio >= 0.6 && aspectRatio < 0.8) score += 8; // Portrait
        
        // Prefer moderate sizes (typical for profile pictures)
        const area = img.width * img.height;
        if (area >= 10000 && area <= 50000) score += 5; // 100x100 to ~224x224
        
        // Bonus for common profile picture dimensions
        if ((img.width >= 150 && img.width <= 250) && (img.height >= 150 && img.height <= 250)) {
          score += 5;
        }
      }
      
      // Prefer JPEG format (common for photos)
      if (img.format === 'jpeg') score += 3;
      
      return { image: img, score };
    });
    
    // Sort by score and return the best candidate
    scoredImages.sort((a, b) => b.score - a.score);
    
    const best = scoredImages[0];
    console.log(`🏆 Best profile picture candidate: ${best.image.width}x${best.image.height} (score: ${best.score})`);
    
    return best.score > 0 ? best.image : null;
  }

  async saveImageToFile(image: ExtractedImage, outputPath: string): Promise<boolean> {
    try {
      console.log(`💾 Saving image to: ${outputPath}`);
      
      // Ensure output directory exists
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      
      // Use Sharp to process and standardize the image
      let sharpImage = sharp(Buffer.from(image.data));
      
      // Resize to standard profile picture size
      sharpImage = sharpImage.resize(200, 200, {
        fit: 'cover',
        position: 'center'
      });
      
      // Convert to PNG for consistency
      await sharpImage.png().toFile(outputPath);
      
      console.log(`✅ Image saved successfully: ${outputPath}`);
      return true;
      
    } catch (error) {
      console.error(`❌ Error saving image: ${error}`);
      return false;
    }
  }

  async processResume(resumeId: string, pdfPath: string): Promise<boolean> {
    try {
      console.log(`\n📄 Processing resume: ${resumeId}`);
      
      // Extract all images from PDF
      const images = await this.extractImagesFromPDF(pdfPath);
      
      if (images.length === 0) {
        console.log(`ℹ️  No images found in ${resumeId}`);
        return false;
      }
      
      // Find the best profile picture candidate
      const profilePicture = await this.findBestProfilePicture(images);
      
      if (!profilePicture) {
        console.log(`ℹ️  No suitable profile picture found in ${resumeId}`);
        return false;
      }
      
      // Save the profile picture
      const outputPath = path.join(process.cwd(), 'public', 'profiles', `${resumeId}.png`);
      const success = await this.saveImageToFile(profilePicture, outputPath);
      
      if (success) {
        console.log(`✅ Successfully extracted profile picture for ${resumeId}`);
      }
      
      return success;
      
    } catch (error) {
      console.error(`❌ Error processing resume ${resumeId}:`, error);
      return false;
    }
  }
}

async function main() {
  const extractor = new PDFImageExtractor();
  
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
          
          // Add a small delay to avoid overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 100));
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
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

export { PDFImageExtractor };
