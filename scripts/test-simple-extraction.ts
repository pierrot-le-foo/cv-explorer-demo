#!/usr/bin/env tsx

import { promises as fs } from 'fs';
import path from 'path';
import { convert } from 'pdf-img-convert';
import sharp from 'sharp';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function testSingleResumeSimple() {
  try {
    const testPdfPath = path.join(process.cwd(), 'public', 'resumes', 'resume_Lauren_Reid.pdf');
    
    // Check if file exists
    try {
      await fs.access(testPdfPath);
    } catch {
      console.log('❌ Test PDF not found');
      return;
    }

    console.log('🧪 Testing pdf-img-convert approach...');
    
    // Convert PDF to image
    console.log('🔄 Converting PDF...');
    const outputImages = await convert(testPdfPath, { 
      page_numbers: [1],
      width: 1200,
      height: 1600
    });
    
    if (outputImages.length === 0) {
      console.log('❌ No images generated');
      return;
    }
    
    const tempImagePath = testPdfPath.replace('.pdf', '_test_simple.png');
    await fs.writeFile(tempImagePath, outputImages[0]);
    console.log(`✅ Image saved: ${tempImagePath}`);
    
    // Get image info
    const metadata = await sharp(tempImagePath).metadata();
    console.log(`📏 Image dimensions: ${metadata.width}x${metadata.height}`);
    
    // Test AI analysis
    console.log('🤖 Analyzing with AI...');
    const imageBuffer = await fs.readFile(tempImagePath);
    const base64Image = imageBuffer.toString('base64');

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this resume. Is there a profile picture? Respond with JSON:
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
    console.log('🔍 AI Response:');
    console.log(content);

    if (content) {
      try {
        const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const result = JSON.parse(cleanContent);
        console.log('✅ Parsed result:', result);
        
        if (result.hasProfilePicture && result.location && result.confidence > 70) {
          console.log('🎯 Attempting extraction...');
          
          const left = Math.round((result.location.x / 100) * metadata.width!);
          const top = Math.round((result.location.y / 100) * metadata.height!);
          const width = Math.round((result.location.width / 100) * metadata.width!);
          const height = Math.round((result.location.height / 100) * metadata.height!);
          
          console.log(`✂️  Extract region: ${left},${top} ${width}x${height}`);
          
          const outputPath = path.join(process.cwd(), 'public', 'profiles', 'test_simple.png');
          await fs.mkdir(path.dirname(outputPath), { recursive: true });
          
          await sharp(tempImagePath)
            .extract({ left, top, width, height })
            .resize(200, 200, { fit: 'cover' })
            .png()
            .toFile(outputPath);
            
          console.log(`✅ Profile picture saved to: ${outputPath}`);
        }
      } catch (error) {
        console.error('❌ Parse/extract error:', error);
      }
    }

    // Clean up
    await fs.unlink(tempImagePath).catch(() => {});

  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

if (require.main === module) {
  testSingleResumeSimple().catch(console.error);
}
