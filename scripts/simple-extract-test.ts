import sharp from 'sharp';
import { join } from 'path';

async function testExtraction() {
  const imagePath = join(process.cwd(), 'public/resume-previews/resume_Alexandra_Mendoza.png');
  console.log('Testing extraction with:', imagePath);
  
  try {
    const image = sharp(imagePath);
    const metadata = await image.metadata();
    console.log('Image metadata:', metadata);
    
    if (metadata.width && metadata.height) {
      // Very conservative regions that should definitely work
      const regions = [
        { name: 'top_left_quarter', x: 0, y: 0, width: Math.floor(metadata.width / 4), height: Math.floor(metadata.height / 4) },
        { name: 'top_right_quarter', x: Math.floor(metadata.width * 0.7), y: 0, width: Math.floor(metadata.width * 0.25), height: Math.floor(metadata.height / 4) },
        { name: 'center_safe', x: Math.floor(metadata.width / 4), y: Math.floor(metadata.height / 4), width: Math.floor(metadata.width / 2), height: Math.floor(metadata.height / 2) }
      ];
      
      for (const region of regions) {
        // Ensure bounds are within image
        const left = Math.floor(region.x);
        const top = Math.floor(region.y);
        const width = Math.floor(region.width);
        const height = Math.floor(region.height);
        
        const rightBound = left + width;
        const bottomBound = top + height;
        
        console.log(`Testing region ${region.name}:`, {
          left, top, width, height,
          rightBound, bottomBound,
          imageWidth: metadata.width, imageHeight: metadata.height,
          withinBounds: rightBound <= metadata.width && bottomBound <= metadata.height
        });
        
        if (rightBound > metadata.width || bottomBound > metadata.height) {
          console.log(`❌ Region ${region.name} exceeds image bounds`);
          continue;
        }
        
        try {
          const extracted = await image
            .extract({ left, top, width, height })
            .png()
            .toBuffer();
            
          console.log(`✅ Successfully extracted ${region.name}, size: ${extracted.length} bytes`);
          
          // Save it to test
          await sharp(extracted).toFile(`test_${region.name}.png`);
          
        } catch (error) {
          console.log(`❌ Failed to extract ${region.name}:`, (error as Error).message);
        }
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testExtraction();
