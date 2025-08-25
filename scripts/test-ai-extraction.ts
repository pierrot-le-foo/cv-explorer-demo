#!/usr/bin/env tsx

import { promises as fs } from 'fs';
import path from 'path';
import puppeteer, { Browser } from 'puppeteer';
import sharp from 'sharp';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function testSingleResume() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    // Test with the first available PDF
    const testPdfPath = path.join(process.cwd(), 'public', 'resumes', 'resume_Lauren_Reid.pdf');
    
    // Check if file exists
    try {
      await fs.access(testPdfPath);
    } catch {
      console.log('❌ Test PDF not found:', testPdfPath);
      return;
    }

    console.log('🔍 Testing with:', testPdfPath);

    // Convert PDF to image
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1600 });
    await page.goto(`file://${testPdfPath}`, { waitUntil: 'networkidle0' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const screenshotBuffer = await page.screenshot({
      type: 'png',
      fullPage: true
    });
    
    const tempImagePath = testPdfPath.replace('.pdf', '_test.png');
    await fs.writeFile(tempImagePath, screenshotBuffer);
    await page.close();

    console.log('📸 Screenshot saved to:', tempImagePath);

    // Test AI analysis
    const imageBuffer = await fs.readFile(tempImagePath);
    const base64Image = imageBuffer.toString('base64');

    console.log('🤖 Sending to GPT-4V...');

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this resume image. Does it contain a profile picture/headshot? 

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
    console.log('🔍 Raw AI response:');
    console.log(content);

    if (content) {
      try {
        const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        console.log('🧹 Cleaned content:');
        console.log(cleanContent);
        
        const result = JSON.parse(cleanContent);
        console.log('✅ Parsed successfully:', result);
      } catch (error) {
        console.error('❌ Parse error:', error);
      }
    }

    // Clean up
    await fs.unlink(tempImagePath).catch(() => {});

  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  testSingleResume().catch(console.error);
}
