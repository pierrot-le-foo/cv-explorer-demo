import { NextRequest } from "next/server";
import { addResume } from "@/lib/actions/resumes";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);
  
  console.log("🚀 Resume upload started:", {
    requestId,
    timestamp: new Date().toISOString(),
    userAgent: request.headers.get("user-agent"),
    contentType: request.headers.get("content-type"),
    contentLength: request.headers.get("content-length"),
  });
  
  try {
    // Parse form data
    console.log(`📝 [${requestId}] Parsing form data...`);
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      console.log(`❌ [${requestId}] Upload failed: No file provided`);
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    console.log(`📄 [${requestId}] File received:`, {
      name: file.name,
      size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
      type: file.type,
    });

    // Validate file type
    if (file.type !== "application/pdf") {
      console.log(`❌ [${requestId}] Upload failed: Invalid file type -`, file.type);
      return Response.json(
        { error: "Only PDF files are supported" },
        { status: 400 }
      );
    }

    // Read file content
    console.log(`🔍 [${requestId}] Reading file content...`);
    const fileReadStartTime = Date.now();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileReadTime = Date.now() - fileReadStartTime;
    console.log(`✅ [${requestId}] File content read successfully:`, {
      bufferSize: buffer.length,
      readTime: `${fileReadTime}ms`,
    });
    
    // TODO: Implement proper PDF parsing using a library like pdf-parse
    // For demonstration, we'll try to read as text, but this won't work for most PDFs
    // Install pdf-parse: npm install pdf-parse @types/pdf-parse
    // Then use: const pdfData = await pdf(buffer); resumeText = pdfData.text;
    console.log(`📖 [${requestId}] Attempting to extract text from PDF...`);
    const textExtractionStartTime = Date.now();
    let resumeText: string;
    try {
      // Extract text from PDF buffer and clean it for database storage
      const rawText = buffer.toString('utf-8');
      
      // Clean the text to remove null bytes and other problematic characters
      // that can cause PostgreSQL UTF-8 encoding errors
      resumeText = rawText
        .replace(/\0/g, '') // Remove null bytes (0x00)
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove other control characters
        .replace(/\uFFFD/g, '') // Remove replacement characters (invalid UTF-8)
        .trim();
      
      const textExtractionTime = Date.now() - textExtractionStartTime;
      console.log(`✅ [${requestId}] Text extraction and cleaning successful:`, {
        originalLength: rawText.length,
        cleanedLength: resumeText.length,
        extractionTime: `${textExtractionTime}ms`,
      });
    } catch (error) {
      const textExtractionTime = Date.now() - textExtractionStartTime;
      console.log(`⚠️  [${requestId}] Direct text conversion failed, using placeholder content:`, {
        extractionTime: `${textExtractionTime}ms`,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      // If direct text conversion fails, use a placeholder
      // In production, implement proper PDF parsing here
      resumeText = `Resume content from ${file.name} - PDF parsing would be implemented here with a proper PDF parser library like pdf-parse`;
    }

    if (!resumeText.trim()) {
      console.log(`❌ [${requestId}] Upload failed: Could not extract text from PDF`);
      return Response.json(
        { error: "Could not extract text from PDF" },
        { status: 400 }
      );
    }

    // Use the existing addResume function to parse and save to database/vector store
    console.log(`🤖 [${requestId}] Processing resume with AI and saving to database...`);
    const resumeStartTime = Date.now();
    const resume = await addResume(resumeText, {
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
    });
    const resumeProcessTime = Date.now() - resumeStartTime;
    console.log(`✅ [${requestId}] Resume processed and saved to database:`, {
      id: resume.id,
      processingTime: `${resumeProcessTime}ms`,
      name: resume.cmetadata.name,
      title: resume.cmetadata.title,
    });

    // Save PDF file to public/resumes directory using the resume ID
    console.log(`💾 [${requestId}] Saving PDF file to filesystem...`);
    const fileWriteStartTime = Date.now();
    const resumesDir = join(process.cwd(), "public", "resumes");
    
    // Ensure the directory exists
    try {
      await mkdir(resumesDir, { recursive: true });
      console.log(`📁 [${requestId}] Resumes directory ensured:`, resumesDir);
    } catch (error) {
      console.log(`📁 [${requestId}] Directory already exists or creation failed:`, error);
    }

    const filePath = join(resumesDir, `${resume.id}.pdf`);
    await writeFile(filePath, buffer);
    const fileWriteTime = Date.now() - fileWriteStartTime;
    console.log(`✅ [${requestId}] PDF file saved successfully:`, {
      path: filePath,
      writeTime: `${fileWriteTime}ms`,
    });

    const totalTime = Date.now() - startTime;
    console.log(`🎉 [${requestId}] Resume upload completed successfully:`, {
      id: resume.id,
      fileName: file.name,
      totalTime: `${totalTime}ms`,
      pdfPath: `/resumes/${resume.id}.pdf`,
      performance: {
        fileRead: `${fileReadTime}ms`,
        aiProcessing: `${resumeProcessTime}ms`,
        fileWrite: `${fileWriteTime}ms`,
      },
    });

    // Return success response
    return Response.json({
      success: true,
      data: {
        id: resume.id,
        fileName: file.name,
        parsedData: resume.cmetadata.parsedData || resume.cmetadata,
        metadata: resume.cmetadata,
        pdfPath: `/resumes/${resume.id}.pdf`,
      },
      message: "Resume uploaded and processed successfully",
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`💥 [${requestId}] Resume upload failed:`, {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      totalTime: `${totalTime}ms`,
      timestamp: new Date().toISOString(),
    });
    
    // Return more specific error messages
    if (error instanceof Error) {
      console.error(`📋 [${requestId}] Error details:`, {
        name: error.name,
        message: error.message,
        cause: error.cause,
      });
      
      return Response.json(
        { 
          error: "Failed to process resume",
          details: error.message 
        }, 
        { status: 500 }
      );
    }
    
    console.error(`🔍 [${requestId}] Unknown error type:`, typeof error, error);
    return Response.json(
      { error: "An unexpected error occurred while processing the resume" },
      { status: 500 }
    );
  }
}
