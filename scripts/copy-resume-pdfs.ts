#!/usr/bin/env tsx

import { promises as fs } from 'fs';
import path from 'path';
import { getResumes } from '@/lib/actions/resumes';

/**
 * Script to copy resume PDFs from /resumes to /public/resumes with ID-based naming
 * This makes resumes accessible via web URLs using their database IDs
 */
async function copyResumePdfs() {
  try {
    console.log('🚀 Starting resume PDF copying process...');
    
    // Create public/resumes directory if it doesn't exist
    const publicResumesDir = path.join(process.cwd(), 'public', 'resumes');
    try {
      await fs.access(publicResumesDir);
      console.log('📁 public/resumes directory exists');
    } catch {
      await fs.mkdir(publicResumesDir, { recursive: true });
      console.log('📁 Created public/resumes directory');
    }

    // Fetch all resumes from database
    console.log('📊 Fetching resumes from database...');
    const resumes = await getResumes();
    console.log(`📊 Found ${resumes.length} resumes in database`);

    // Get list of available PDF files in resumes folder
    const resumesDir = path.join(process.cwd(), 'resumes');
    const pdfFiles = await fs.readdir(resumesDir);
    const availablePdfs = pdfFiles.filter(file => file.endsWith('.pdf'));
    console.log(`📄 Found ${availablePdfs.length} PDF files in resumes folder`);

    let copiedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    // Process each resume
    for (const resume of resumes) {
      try {
        // Extract filename from metadata
        const metadata = resume.cmetadata;
        let sourceFileName: string | null = null;

        // Try different possible filename fields in metadata
        if ((metadata as any).source) {
          sourceFileName = (metadata as any).source as string;
        } else if (metadata.fileName) {
          sourceFileName = metadata.fileName as string;
        } else if ((metadata as any).filename) {
          sourceFileName = (metadata as any).filename as string;
        } else if (metadata.name) {
          // Try to construct filename from name
          const name = metadata.name as string;
          const possibleFilenames = [
            `resume_${name.replace(/\s+/g, '_')}.pdf`,
            `${name.replace(/\s+/g, '_')}.pdf`,
            `resume_${name}.pdf`,
          ];
          
          for (const filename of possibleFilenames) {
            if (availablePdfs.includes(filename)) {
              sourceFileName = filename;
              break;
            }
          }
        }

        if (!sourceFileName) {
          console.log(`⚠️  No filename found in metadata for resume ID: ${resume.id}`);
          skippedCount++;
          continue;
        }

        // Check if source file exists
        const sourcePath = path.join(resumesDir, sourceFileName);
        try {
          await fs.access(sourcePath);
        } catch {
          console.log(`⚠️  Source file not found: ${sourceFileName} for resume ID: ${resume.id}`);
          skippedCount++;
          continue;
        }

        // Copy file to public/resumes with ID as filename
        const targetFileName = `${resume.id}.pdf`;
        const targetPath = path.join(publicResumesDir, targetFileName);

        await fs.copyFile(sourcePath, targetPath);
        console.log(`✅ Copied: ${sourceFileName} → ${targetFileName}`);
        copiedCount++;

      } catch (error) {
        const errorMessage = `Error processing resume ${resume.id}: ${error instanceof Error ? error.message : String(error)}`;
        console.error(`❌ ${errorMessage}`);
        errors.push(errorMessage);
      }
    }

    // Summary
    console.log('\n📋 Summary:');
    console.log(`✅ Successfully copied: ${copiedCount} files`);
    console.log(`⚠️  Skipped: ${skippedCount} files`);
    console.log(`❌ Errors: ${errors.length} files`);

    if (errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      errors.forEach(error => console.log(`  - ${error}`));
    }

    console.log('\n🎉 Resume PDF copying process completed!');
    
  } catch (error) {
    console.error('💥 Fatal error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Clean up function to remove all files from public/resumes directory
 */
async function cleanupPublicResumes() {
  try {
    const publicResumesDir = path.join(process.cwd(), 'public', 'resumes');
    const files = await fs.readdir(publicResumesDir);
    
    for (const file of files) {
      if (file.endsWith('.pdf')) {
        await fs.unlink(path.join(publicResumesDir, file));
        console.log(`🗑️  Removed: ${file}`);
      }
    }
    
    console.log(`🧹 Cleaned up ${files.length} files from public/resumes`);
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--cleanup') || args.includes('-c')) {
    cleanupPublicResumes();
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Resume PDF Copy Script

Usage:
  tsx scripts/copy-resume-pdfs.ts           Copy resume PDFs to public folder
  tsx scripts/copy-resume-pdfs.ts --cleanup Clean up public/resumes folder
  tsx scripts/copy-resume-pdfs.ts --help    Show this help message

Description:
  This script fetches all resumes from the database and copies the corresponding
  PDF files from the /resumes folder to /public/resumes with the database ID 
  as the filename (e.g., abc123.pdf).
  
  The script uses metadata fields (fileName, filename, or name) to match
  database records with PDF files.
    `);
  } else {
    copyResumePdfs();
  }
}

export { copyResumePdfs, cleanupPublicResumes };
