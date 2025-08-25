#!/usr/bin/env tsx

import pdf2html from 'pdf2html';
import path from 'path';
import { promises as fs } from 'fs';

async function testPdf2Html() {
  try {
    const testPdfPath = path.join(process.cwd(), 'public', 'resumes', 'resume_Lauren_Reid.pdf');
    
    // Check if file exists
    try {
      await fs.access(testPdfPath);
    } catch {
      console.log('❌ Test PDF not found');
      return;
    }

    console.log('🧪 Testing pdf2html with simple options...');
    
    // Try the simplest possible usage first
    const result = await pdf2html.html(testPdfPath);
    
    console.log('✅ Conversion successful!');
    console.log('📄 HTML Length:', result.length);
    console.log('🔍 First 500 characters:');
    console.log(result.substring(0, 500));
    
    // Look for image tags
    const imgMatches = result.match(/<img[^>]+>/gi);
    if (imgMatches) {
      console.log(`🖼️  Found ${imgMatches.length} image tags:`);
      imgMatches.forEach((img, index) => {
        console.log(`  ${index + 1}: ${img}`);
      });
    } else {
      console.log('ℹ️  No image tags found in HTML');
    }

  } catch (error) {
    console.error('❌ Error testing pdf2html:', error);
  }
}

if (require.main === module) {
  testPdf2Html();
}
