#!/usr/bin/env tsx

import { promises as fs } from 'fs';
import path from 'path';
import puppeteer, { Browser } from 'puppeteer';
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

class AIProfilePictureExtractor {
  private browser: Browser | null = null;

  async initialize() {
    console.log('🚀 Initializing browser...');
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async analyzeResumeForProfilePicture(imagePath: string): Promise<ProfileLocation> {
    try {
      // Read the image and convert to base64
      const imageBuffer = await fs.readFile(imagePath);
      const base64Image = imageBuffer.toString('base64');

      console.log(`🔍 Analyzing ${path.basename(imagePath)} with GPT-4V...`);

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this resume image and determine if there is a profile picture/headshot/photo of a person visible. 

If there IS a profile picture:
1. Provide the approximate location as percentages of the image (x, y, width, height where 0,0 is top-left)
2. Rate your confidence from 0-100
3. Briefly describe what you see

If there is NO profile picture, just indicate that.

IMPORTANT: Respond with ONLY a raw JSON object, no markdown formatting, no code blocks:

{
  "hasProfilePicture": boolean,
  "confidence": number,
  "location": {
    "x": number,
    "y": number, 
    "width": number,
    "height": number
  },
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
        // Clean the response - remove markdown code blocks if present
        const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        result = JSON.parse(cleanContent) as ProfileLocation;
      } catch (parseError) {
        console.error('❌ Failed to parse AI response:', content);
        throw parseError;
      }
      console.log(`📊 Analysis result: ${result.hasProfilePicture ? 'Profile picture found' : 'No profile picture'} (confidence: ${result.confidence}%)`);
      
      return result;
    } catch (error) {
      console.error('❌ Error analyzing image with AI:', error);
      return { hasProfilePicture: false, confidence: 0 };
    }
  }

  async convertPdfToImage(pdfPath: string): Promise<string> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const page = await this.browser.newPage();
    
    try {
      // Set a reasonable viewport
      await page.setViewport({ width: 1200, height: 1600 });
      
      // Navigate to the PDF
      await page.goto(`file://${pdfPath}`, { waitUntil: 'networkidle0' });
      
      // Wait a bit for PDF to fully render
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Take screenshot
      const screenshotBuffer = await page.screenshot({
        type: 'png',
        fullPage: true
      });
      
      // Save temporary image
      const tempImagePath = pdfPath.replace('.pdf', '_temp.png');
      await fs.writeFile(tempImagePath, screenshotBuffer);
      
      return tempImagePath;
    } finally {
      await page.close();
    }
  }

  async extractProfilePicture(imagePath: string, location: ProfileLocation['location'], outputPath: string): Promise<boolean> {
    if (!location) {
      return false;
    }

    try {
      // Get image dimensions
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

      // Extract the region
      await sharp(imagePath)
        .extract({ left, top, width, height })
        .resize(200, 200, { fit: 'cover' }) // Standardize size
        .png()
        .toFile(outputPath);

      console.log(`✅ Profile picture extracted to: ${outputPath}`);
      return true;
    } catch (error) {
      console.error('❌ Error extracting profile picture:', error);
      return false;
    }
  }

  async processResume(resumeId: string, pdfPath: string): Promise<boolean> {
    try {
      console.log(`\n📄 Processing resume: ${resumeId}`);

      // Convert PDF to image
      const imagePath = await this.convertPdfToImage(pdfPath);

      // Analyze with AI
      const analysis = await this.analyzeResumeForProfilePicture(imagePath);

      if (analysis.hasProfilePicture && analysis.location && analysis.confidence > 70) {
        // Extract profile picture
        const profileOutputPath = path.join(process.cwd(), 'public', 'profiles', `${resumeId}.png`);
        
        // Ensure profiles directory exists
        await fs.mkdir(path.dirname(profileOutputPath), { recursive: true });

        const success = await this.extractProfilePicture(imagePath, analysis.location, profileOutputPath);
        
        if (success) {
          console.log(`✅ Successfully extracted profile picture for ${resumeId}`);
          console.log(`📝 Description: ${analysis.description}`);
        }

        // Clean up temp image
        await fs.unlink(imagePath).catch(() => {});
        
        return success;
      } else {
        console.log(`ℹ️  No profile picture found for ${resumeId} (confidence: ${analysis.confidence}%)`);
        
        // Clean up temp image
        await fs.unlink(imagePath).catch(() => {});
        
        return false;
      }
    } catch (error) {
      console.error(`❌ Error processing resume ${resumeId}:`, error);
      return false;
    }
  }
}

async function main() {
  // Load environment variables explicitly
  if (!process.env.OPENAI_API_KEY) {
    try {
      const envContent = await fs.readFile('.env', 'utf8');
      const apiKeyMatch = envContent.match(/OPENAI_API_KEY="?([^"\n]+)"?/);
      if (apiKeyMatch) {
        process.env.OPENAI_API_KEY = apiKeyMatch[1];
      }
    } catch (error) {
      console.error('❌ Could not load .env file');
    }
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  const extractor = new AIProfilePictureExtractor();
  
  try {
    await extractor.initialize();

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
    await extractor.cleanup();
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

export { AIProfilePictureExtractor };
