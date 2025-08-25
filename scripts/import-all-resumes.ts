#!/usr/bin/env tsx

import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { addResume } from "../lib/actions/resumes";
import pdf from 'pdf-parse';

/**
 * Script to import all PDF resumes from the public/resumes directory into the database
 * Uses the same logic as the upload route to process and store resumes
 */

interface ImportResult {
  fileName: string;
  status: 'success' | 'error' | 'skipped';
  resumeId?: string;
  name?: string;
  title?: string;
  error?: string;
  processingTime?: number;
}

async function importAllResumes(): Promise<void> {
  const startTime = Date.now();
  console.log("🚀 Starting bulk resume import...");
  console.log("📅 Started at:", new Date().toISOString());
  
  try {
    // Get the resumes directory path
    const resumesDir = join(process.cwd(), "resumes");
    console.log("📁 Scanning directory:", resumesDir);
    
    // Check if directory exists
    try {
      await stat(resumesDir);
    } catch (error) {
      console.error("❌ Resumes directory not found:", resumesDir);
      process.exit(1);
    }
    
    // Read all files in the directory
    const files = await readdir(resumesDir);
    const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));
    
    console.log(`📄 Found ${pdfFiles.length} PDF files to process`);
    
    if (pdfFiles.length === 0) {
      console.log("ℹ️  No PDF files found in the resumes directory");
      return;
    }
    
    const results: ImportResult[] = [];
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    
    // Process each PDF file
    for (let i = 0; i < pdfFiles.length; i++) {
      const fileName = pdfFiles[i];
      const fileNumber = i + 1;
      
      console.log(`\n📋 [${fileNumber}/${pdfFiles.length}] Processing: ${fileName}`);
      
      const result: ImportResult = {
        fileName,
        status: 'error'
      };
      
      const fileStartTime = Date.now(); // Move outside try block for scope
      
      try {
        // Read the PDF file
        const filePath = join(resumesDir, fileName);
        console.log(`   🔍 Reading file: ${filePath}`);
        
        const buffer = await readFile(filePath);
        console.log(`   ✅ File read successfully (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
        
        // Extract text from PDF buffer using proper PDF parsing
        console.log(`   📖 Extracting text from PDF using pdf-parse...`);
        let resumeText: string;
        
        try {
          // Use pdf-parse to properly extract text from PDF
          const pdfData = await pdf(buffer);
          const rawText = pdfData.text;
          
          console.log(`   📊 PDF metadata:`, {
            pages: pdfData.numpages,
            info: pdfData.info?.Title || 'No title',
            rawTextLength: rawText.length
          });
          
          // Clean the extracted text to remove problematic characters
          // that can cause PostgreSQL UTF-8 encoding errors
          resumeText = rawText
            .replace(/\0/g, '') // Remove null bytes (0x00)
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove other control characters
            .replace(/\uFFFD/g, '') // Remove replacement characters (invalid UTF-8)
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
            
          console.log(`   ✅ Text extraction successful (${resumeText.length} characters clean text)`);
          
        } catch (error) {
          console.log(`   ⚠️  PDF parsing failed:`, error instanceof Error ? error.message : 'Unknown error');
          console.log(`   🔄 Falling back to placeholder content`);
          
          // Fallback for problematic PDFs
          resumeText = `Resume content from ${fileName} - PDF parsing failed, please check the file format. This is a placeholder that will be processed by AI to extract any available information.`;
        }
        
        if (!resumeText.trim()) {
          result.status = 'skipped';
          result.error = 'Could not extract text from PDF';
          console.log(`   ⏭️  Skipping: ${result.error}`);
          skippedCount++;
          results.push(result);
          continue;
        }
        
        // Process resume with AI and save to database using the same logic as upload route
        console.log(`   🤖 Processing with AI and saving to database...`);
        const resume = await addResume(resumeText, {
          fileName: fileName,
          uploadedAt: new Date().toISOString()
        });
        
        const processingTime = Date.now() - fileStartTime;
        
        result.status = 'success';
        result.resumeId = resume.id;
        result.name = resume.cmetadata.name as string;
        result.title = resume.cmetadata.title as string;
        result.processingTime = processingTime;
        
        console.log(`   ✅ Successfully processed:`, {
          id: resume.id,
          name: result.name,
          title: result.title,
          processingTime: `${processingTime}ms`
        });
        
        successCount++;
        
      } catch (error) {
        const processingTime = Date.now() - fileStartTime;
        result.status = 'error';
        result.error = error instanceof Error ? error.message : 'Unknown error';
        result.processingTime = processingTime;
        
        console.log(`   ❌ Error processing file:`, {
          error: result.error,
          processingTime: `${processingTime}ms`
        });
        
        errorCount++;
      }
      
      results.push(result);
    }
    
    // Print summary
    const totalTime = Date.now() - startTime;
    console.log("\n" + "=".repeat(80));
    console.log("📊 IMPORT SUMMARY");
    console.log("=".repeat(80));
    console.log(`📅 Completed at: ${new Date().toISOString()}`);
    console.log(`⏱️  Total time: ${(totalTime / 1000).toFixed(2)} seconds`);
    console.log(`📄 Total files: ${pdfFiles.length}`);
    console.log(`✅ Successfully imported: ${successCount}`);
    console.log(`❌ Failed: ${errorCount}`);
    console.log(`⏭️  Skipped: ${skippedCount}`);
    
    if (successCount > 0) {
      console.log("\n🎉 Successfully imported resumes:");
      results
        .filter(r => r.status === 'success')
        .forEach((result, index) => {
          console.log(`   ${index + 1}. ${result.fileName} → ${result.name} (${result.title}) [${result.resumeId}]`);
        });
    }
    
    if (errorCount > 0) {
      console.log("\n💥 Failed imports:");
      results
        .filter(r => r.status === 'error')
        .forEach((result, index) => {
          console.log(`   ${index + 1}. ${result.fileName} - Error: ${result.error}`);
        });
    }
    
    if (skippedCount > 0) {
      console.log("\n⏭️  Skipped files:");
      results
        .filter(r => r.status === 'skipped')
        .forEach((result, index) => {
          console.log(`   ${index + 1}. ${result.fileName} - Reason: ${result.error}`);
        });
    }
    
    console.log("\n" + "=".repeat(80));
    
    if (errorCount > 0) {
      console.log("⚠️  Some files failed to import. Check the errors above.");
      process.exit(1);
    } else {
      console.log("🎉 All files processed successfully!");
      process.exit(0);
    }
    
  } catch (error) {
    console.error("💥 Script failed:", error);
    process.exit(1);
  }
}

// Add help text
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
📋 Resume Import Script

This script scans all PDF files in the public/resumes directory and imports them
into the database using the same logic as the upload API route.

Usage:
  npx tsx scripts/import-all-resumes.ts

Options:
  --help, -h    Show this help message

The script will:
  1. Scan public/resumes/ for PDF files
  2. Extract text from each PDF
  3. Process with AI using Claude for parsing
  4. Store in PostgreSQL with vector embeddings
  5. Provide a detailed summary report

Requirements:
  - PostgreSQL database running
  - Environment variables configured
  - API keys for OpenAI/Anthropic
  `);
  process.exit(0);
}

// Run the import
importAllResumes().catch((error) => {
  console.error("💥 Unhandled error:", error);
  process.exit(1);
});
