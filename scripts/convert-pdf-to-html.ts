#!/usr/bin/env tsx

import { promises as fs } from 'fs';
import path from 'path';
import puppeteer, { Browser } from 'puppeteer';
import prisma from '../prisma/prisma';

class PDFToHTMLConverter {
  private browser: Browser | null = null;
  private outputDir: string;

  constructor() {
    this.outputDir = path.join(process.cwd(), 'public', 'html-resumes');
  }

  async initialize() {
    console.log('🚀 Initializing browser...');
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    // Ensure output directory exists
    await fs.mkdir(this.outputDir, { recursive: true });
    console.log(`📁 Output directory: ${this.outputDir}`);
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async convertPDFToHTML(pdfPath: string, resumeId: string): Promise<string | null> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    try {
      console.log(`🔄 Converting ${path.basename(pdfPath)} to HTML...`);

      const page = await this.browser.newPage();
      
      try {
        // Set a reasonable viewport for PDF rendering
        await page.setViewport({ width: 1200, height: 1600 });
        
        // Navigate to the PDF
        await page.goto(`file://${pdfPath}`, { waitUntil: 'networkidle0' });
        
        // Wait for PDF to fully render
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Take screenshot of the PDF as PNG
        const screenshotBuffer = await page.screenshot({
          type: 'png',
          fullPage: true
        });
        
        // Convert screenshot to base64
        const base64Image = Buffer.from(screenshotBuffer).toString('base64');
        
        // Create HTML content with embedded image
        const htmlContent = this.createHTMLWithEmbeddedImage(base64Image, resumeId, pdfPath);
        
        // Save HTML file
        const htmlPath = path.join(this.outputDir, `${resumeId}.html`);
        await fs.writeFile(htmlPath, htmlContent);
        
        console.log(`✅ HTML created: ${htmlPath}`);
        return htmlPath;
        
      } finally {
        await page.close();
      }
    } catch (error) {
      console.error(`❌ Error converting ${resumeId}:`, error);
      return null;
    }
  }

  createHTMLWithEmbeddedImage(base64Image: string, resumeId: string, originalPdfPath: string): string {
    const fileName = path.basename(originalPdfPath);
    const fileStats = require('fs').statSync(originalPdfPath);
    const fileSize = (fileStats.size / 1024).toFixed(2); // Size in KB

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Resume: ${resumeId}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 900px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
            line-height: 1.6;
        }
        .container {
            background-color: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 2rem;
            font-weight: 300;
        }
        .metadata {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 30px;
            border-left: 4px solid #667eea;
        }
        .metadata-item {
            display: flex;
            flex-direction: column;
        }
        .metadata-label {
            font-size: 0.875rem;
            color: #6c757d;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .metadata-value {
            font-size: 1rem;
            color: #495057;
            font-weight: 500;
            margin-top: 4px;
        }
        .resume-image-container {
            text-align: center;
            margin: 30px 0;
        }
        .resume-image {
            max-width: 100%;
            height: auto;
            border: 2px solid #e9ecef;
            border-radius: 8px;
            box-shadow: 0 8px 25px rgba(0,0,0,0.1);
            transition: transform 0.3s ease;
        }
        .resume-image:hover {
            transform: scale(1.02);
        }
        .actions {
            display: flex;
            gap: 15px;
            justify-content: center;
            margin-top: 30px;
            flex-wrap: wrap;
        }
        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            font-size: 0.9rem;
            font-weight: 500;
            text-decoration: none;
            transition: all 0.3s ease;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }
        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .btn-secondary {
            background-color: #6c757d;
            color: white;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #dee2e6;
            color: #6c757d;
            font-size: 0.875rem;
        }
        @media (max-width: 768px) {
            body {
                padding: 10px;
            }
            .container {
                padding: 20px;
            }
            .header h1 {
                font-size: 1.5rem;
            }
            .metadata {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📄 Resume Viewer</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">${resumeId}</p>
        </div>
        
        <div class="metadata">
            <div class="metadata-item">
                <span class="metadata-label">Resume ID</span>
                <span class="metadata-value">${resumeId}</span>
            </div>
            <div class="metadata-item">
                <span class="metadata-label">Original File</span>
                <span class="metadata-value">${fileName}</span>
            </div>
            <div class="metadata-item">
                <span class="metadata-label">File Size</span>
                <span class="metadata-value">${fileSize} KB</span>
            </div>
            <div class="metadata-item">
                <span class="metadata-label">Generated</span>
                <span class="metadata-value">${new Date().toLocaleString()}</span>
            </div>
        </div>
        
        <div class="resume-image-container">
            <img src="data:image/png;base64,${base64Image}" 
                 alt="Resume for ${resumeId}" 
                 class="resume-image"
                 loading="lazy" />
        </div>
        
        <div class="actions">
            <button class="btn btn-primary" onclick="window.print()">
                🖨️ Print Resume
            </button>
            <button class="btn btn-secondary" onclick="downloadResume()">
                💾 Download Image
            </button>
            <button class="btn btn-secondary" onclick="copyToClipboard()">
                📋 Copy Link
            </button>
        </div>
        
        <div class="footer">
            <p>CV Explorer - Resume converted to HTML for easy viewing and analysis</p>
            <p>Generated using Puppeteer PDF rendering technology</p>
        </div>
    </div>

    <script>
        function downloadResume() {
            const link = document.createElement('a');
            link.href = 'data:image/png;base64,${base64Image}';
            link.download = '${resumeId}_resume.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
        
        function copyToClipboard() {
            navigator.clipboard.writeText(window.location.href).then(() => {
                alert('URL copied to clipboard!');
            }).catch(() => {
                alert('Failed to copy URL to clipboard');
            });
        }
        
        // Add zoom functionality
        let isZoomed = false;
        document.querySelector('.resume-image').addEventListener('click', function() {
            if (isZoomed) {
                this.style.transform = 'scale(1)';
                this.style.cursor = 'zoom-in';
                isZoomed = false;
            } else {
                this.style.transform = 'scale(1.5)';
                this.style.cursor = 'zoom-out';
                isZoomed = true;
            }
        });
    </script>
</body>
</html>
    `.trim();
  }

  async processAllResumes(): Promise<void> {
    try {
      // Get all resumes from database
      const resumes = await prisma.resume.findMany({
        select: { id: true, cmetadata: true }
      });

      console.log(`📚 Found ${resumes.length} resumes to convert`);

      let successCount = 0;
      let totalCount = 0;

      for (const resume of resumes) {
        totalCount++;
        
        if (resume.cmetadata && typeof resume.cmetadata === 'object' && 'source' in resume.cmetadata) {
          const pdfPath = path.join(process.cwd(), 'public', 'resumes', `${resume.id}.pdf`);
          
          // Check if PDF exists
          try {
            await fs.access(pdfPath);
            const htmlPath = await this.convertPDFToHTML(pdfPath, resume.id);
            if (htmlPath) {
              successCount++;
              console.log(`✅ Success: ${resume.id}`);
            }
          } catch {
            console.log(`⚠️  PDF not found for resume ${resume.id}, skipping...`);
          }
        } else {
          console.log(`⚠️  No source metadata for resume ${resume.id}, skipping...`);
        }
      }

      console.log(`\n🎉 Conversion complete!`);
      console.log(`📊 Results: ${successCount}/${totalCount} PDFs converted to HTML`);

    } catch (error) {
      console.error('❌ Fatal error:', error);
      throw error;
    }
  }
}

async function main() {
  const converter = new PDFToHTMLConverter();
  
  try {
    await converter.initialize();
    await converter.processAllResumes();
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    await converter.cleanup();
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}

export { PDFToHTMLConverter };
