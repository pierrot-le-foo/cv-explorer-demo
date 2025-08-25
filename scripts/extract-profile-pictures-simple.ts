#!/usr/bin/env tsx

import { promises as fs } from 'fs';
import path from 'path';
import { convert } from 'pdf-img-convert';
import sharp from 'sharp';
import OpenAI from 'openai';
import prisma from '../prisma/prisma';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ProfileLocation {
  hasProfilePicture: boolean;
  confidence: number;
  location?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  description?: string;
}

class SimpleProfileExtractor {
  async convertPdfToImage(pdfPath: string): Promise<string> {
    try {
      console.log(`🔄 Converting PDF to image: ${path.basename(pdfPath)}`);
      
      // Convert first page of PDF to image
      const outputImages = await convert(pdfPath, { 
        page_numbers: [1],  // Only first page
        width: 1200,        // Good resolution for analysis
        height: 1600        // Standard resume aspect ratio
      });
      
      if (outputImages.length === 0) {
        throw new Error('No images generated from PDF');
      }
      
      // Save the converted image temporarily
      const tempImagePath = pdfPath.replace('.pdf', '_converted.png');
      await fs.writeFile(tempImagePath, outputImages[0]);
      
      console.log(`✅ PDF converted to image: ${tempImagePath}`);
      return tempImagePath;
      
    } catch (error) {
      console.error('❌ Error converting PDF to image:', error);
      throw error;
    }
  }

  async analyzeForProfilePicture(imagePath: string): Promise<ProfileLocation> {
    try {
      const imageBuffer = await fs.readFile(imagePath);
      const base64Image = imageBuffer.toString('base64');

      console.log(`🔍 Analyzing with GPT-4V...`);

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this resume image and determine if there is a profile picture/headshot/photo of a person visible. 

If there IS a profile picture, provide the location as percentages (0-100) where 0,0 is top-left.

Respond with ONLY a raw JSON object:
{
  "hasProfilePicture": boolean,
  "confidence": number,
  "location": {"x": number, "y": number, "width": number, "height": number},
  "description": "string"
}`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 500
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      // Parse the JSON response
      let result: ProfileLocation;
      try {
        const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        result = JSON.parse(cleanContent) as ProfileLocation;
      } catch (parseError) {
        console.error('❌ Failed to parse AI response:', content);
        throw parseError;
      }

      console.log(`📊 Analysis: ${result.hasProfilePicture ? 'Found' : 'No'} profile picture (confidence: ${result.confidence}%)`);
      if (result.description) {
        console.log(`📝 Description: ${result.description}`);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error analyzing image:', error);
      return { hasProfilePicture: false, confidence: 0 };
    }
  }

  async extractProfilePicture(imagePath: string, location: ProfileLocation['location'], outputPath: string): Promise<boolean> {
    if (!location) {
      return false;
    }

    try {
      // Get image metadata
      const metadata = await sharp(imagePath).metadata();
      if (!metadata.width || !metadata.height) {
        throw new Error('Could not get image dimensions');
      }

      // Convert percentages to pixels
      const left = Math.round((location.x / 100) * metadata.width);
      const top = Math.round((location.y / 100) * metadata.height);
      const width = Math.round((location.width / 100) * metadata.width);
      const height = Math.round((location.height / 100) * metadata.height);

      // Validate bounds
      if (left < 0 || top < 0 || left + width > metadata.width || top + height > metadata.height) {
        console.error('❌ Invalid extraction bounds:', { left, top, width, height, imageWidth: metadata.width, imageHeight: metadata.height });
        return false;
      }

      console.log(`✂️  Extracting region: ${left},${top} ${width}x${height} from ${metadata.width}x${metadata.height}`);

      // Ensure output directory exists
      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      // Extract and resize the region
      await sharp(imagePath)
        .extract({ left, top, width, height })
        .resize(200, 200, { 
          fit: 'cover',
          position: 'center'
        })
        .png()
        .toFile(outputPath);

      console.log(`✅ Profile picture extracted: ${outputPath}`);
      return true;
    } catch (error) {
      console.error('❌ Error extracting profile picture:', error);
      return false;
    }
  }

  async processResume(resumeId: string, pdfPath: string): Promise<boolean> {
    let tempImagePath: string | null = null;
    
    try {
      console.log(`\n📄 Processing resume: ${resumeId}`);

      // Convert PDF to image
      tempImagePath = await this.convertPdfToImage(pdfPath);

      // Analyze with AI
      const analysis = await this.analyzeForProfilePicture(tempImagePath);

      if (analysis.hasProfilePicture && analysis.location && analysis.confidence > 70) {
        // Extract profile picture
        const profileOutputPath = path.join(process.cwd(), 'public', 'profiles', `${resumeId}.png`);
        
        const success = await this.extractProfilePicture(tempImagePath, analysis.location, profileOutputPath);
        
        return success;
      } else {
        console.log(`ℹ️  No profile picture found (confidence: ${analysis.confidence}%)`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Error processing resume ${resumeId}:`, error);
      return false;
    } finally {
      // Clean up temporary image
      if (tempImagePath) {
        await fs.unlink(tempImagePath).catch(() => {});
      }
    }
  }
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  const extractor = new SimpleProfileExtractor();
  
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
          
          // Add delay to respect OpenAI rate limits
          await new Promise(resolve => setTimeout(resolve, 1000));
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

export { SimpleProfileExtractor };
