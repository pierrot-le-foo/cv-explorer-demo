"use server";
import prisma from "@/prisma/prisma";
import { addVectors, searchVectorsWithScore, chunkText } from "@/lib/ai/vectors";
import { generateId, generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { ResumeSchema } from "../schemas/resume-schema";

export type ResumeData = {
  id: string;
  document: string;
  cmetadata: {
    name?: string;
    title?: string;
    summary?: string;
    fileName?: string;
    uploadedAt?: string;
    parsedData?: {
      personalInformation?: {
        name?: string;
        email?: string;
        phone?: string;
        address?: string;
        website?: string;
        linkedin?: string;
      };
      experiences?: Array<{
        title: string;
        company: string;
        location?: string;
        startDate: string;
        endDate?: string;
        description?: string;
        achievements?: string[];
      }>;
      education?: Array<{
        degree: string;
        field: string;
        institution: string;
        location?: string;
        graduationDate?: string;
        gpa?: string;
        honors?: string[];
      }>;
    };
  };
};

/**
 * Server action to get a list of all resumes from the database
 * @returns Promise<ResumeData[]> - Array of resumes with metadata
 */
export async function getResumes(): Promise<ResumeData[]> {
  try {
    // Since our data is stored in langchain_pg_embedding table, query it directly
    const resumes = await prisma.$queryRaw<Array<{
      id: string;
      document: string;
      cmetadata: Record<string, unknown>;
    }>>`
      SELECT id, document, cmetadata 
      FROM langchain_pg_embedding 
      ORDER BY id DESC
    `;

    return resumes.map((resume) => {
      // Extract title from the beginning of the document
      const lines = resume.document.split('\n').filter(line => line.trim());
      const title = lines.length > 1 ? lines[1].replace(/[*#]/g, '').trim() : 'No Title';
      
      return {
        id: resume.id,
        document: resume.document,
        cmetadata: {
          name: resume.cmetadata.name,
          fileName: resume.cmetadata.filename,
          title: title,
          summary: resume.document.substring(0, 200) + '...',
          ...resume.cmetadata
        } as ResumeData["cmetadata"],
      };
    });
  } catch (error) {
    console.error("Error fetching resumes:", error);
    throw new Error("Failed to fetch resumes");
  }
}

/**
 * Server action to get a specific resume by ID
 * @param id - Resume ID
 * @returns Promise<ResumeData | null> - Resume data or null if not found
 */
export async function getResumeById(id: string): Promise<ResumeData | null> {
  try {
    const resume = await prisma.resume.findUnique({
      where: { id },
      select: {
        id: true,
        document: true,
        cmetadata: true,
      },
    });

    if (!resume) {
      return null;
    }

    return {
      id: resume.id,
      document: resume.document,
      cmetadata: resume.cmetadata as ResumeData["cmetadata"],
    };
  } catch (error) {
    console.error("Error fetching resume by ID:", error);
    throw new Error("Failed to fetch resume");
  }
}

/**
 * Server action to search resumes by content or metadata
 * @param query - Search query string
 * @returns Promise<ResumeData[]> - Array of matching resumes
 */
export async function searchResumes(query: string): Promise<ResumeData[]> {
  try {
    if (!query.trim()) {
      return getResumes();
    }

    const resumes = await prisma.resume.findMany({
      where: {
        OR: [
          {
            document: {
              contains: query,
              mode: "insensitive",
            },
          },
          {
            cmetadata: {
              path: ["name"],
              string_contains: query,
            },
          },
          {
            cmetadata: {
              path: ["title"],
              string_contains: query,
            },
          },
          {
            cmetadata: {
              path: ["summary"],
              string_contains: query,
            },
          },
        ],
      },
      select: {
        id: true,
        document: true,
        cmetadata: true,
      },
      orderBy: {
        id: "desc",
      },
    });

    return resumes.map((resume) => ({
      id: resume.id,
      document: resume.document,
      cmetadata: resume.cmetadata as ResumeData["cmetadata"],
    }));
  } catch (error) {
    console.error("Error searching resumes:", error);
    throw new Error("Failed to search resumes");
  }
}

/**
 * Server action to perform semantic vector search on resumes
 * @param query - Search query string for semantic similarity
 * @param limit - Maximum number of results to return (default: 5)
 * @returns Promise<ResumeData[]> - Array of semantically similar resumes with scores
 */
export async function semanticSearchResumes(
  query: string, 
  limit: number = 5
): Promise<ResumeData[]> {
  try {
    if (!query.trim()) {
      return getResumes();
    }

    console.log('Semantic search query:', query);

    // Perform semantic vector search
    const vectorResults = await searchVectorsWithScore(query, limit);
    
    console.log('Vector search results:', vectorResults.map(([doc, score]) => ({
      score,
      metadata: doc.metadata,
      content: doc.pageContent.substring(0, 100) + '...'
    })));
    
    // Convert vector search results directly to ResumeData format
    // Since our data is only in the langchain table, not the Prisma Resume table
    const results = vectorResults
      .filter(([_doc, score]) => score > 0.1) // Very low threshold to see all results
      .map(([doc, score]) => {
        // Extract title from the beginning of the document
        const lines = doc.pageContent.split('\n').filter(line => line.trim());
        const title = lines.length > 1 ? lines[1].replace(/[*#]/g, '').trim() : 'No Title';
        
        return {
          id: doc.metadata.id || `langchain-${Date.now()}-${Math.random()}`,
          document: doc.pageContent,
          cmetadata: {
            name: doc.metadata.name,
            fileName: doc.metadata.filename,
            title: title,
            summary: `Score: ${score.toFixed(3)} - ${doc.pageContent.substring(0, 200)}...`,
            ...doc.metadata
          } as ResumeData["cmetadata"],
        };
      });

    console.log('Final results:', results.length);
    return results;
  } catch (error) {
    console.error("Error performing semantic search:", error);
    throw new Error("Failed to perform semantic search");
  }
}

/**
 * Extract and limit resume content for AI parsing to stay within token limits
 * @param content - The full resume content (potentially very large)
 * @returns Limited content focusing on the most relevant information
 */
function extractResumeContent(content: string): string {
  const maxTokens = 40000; // Much more conservative limit to ensure we stay well under 200K
  const avgCharsPerToken = 4; // Rough estimate: 1 token ≈ 4 characters
  const maxChars = maxTokens * avgCharsPerToken; // ~160,000 characters

  // If content is already within limits, return as-is
  if (content.length <= maxChars) {
    return content;
  }

  console.log(`Content too large (${content.length} chars), aggressively extracting key sections...`);

  // First, clean up PDF artifacts more aggressively
  const cleanedContent = content
    .replace(/\s+/g, ' ') // Collapse multiple whitespace into single spaces
    .replace(/[^\x20-\x7E\n\r\t]/g, '') // Remove non-ASCII characters that might be PDF artifacts
    .replace(/(.)\1{10,}/g, '$1$1$1') // Replace long repeated characters with just 3 repetitions
    .trim();

  // If still too large after cleaning, do aggressive section extraction
  if (cleanedContent.length > maxChars) {
    const sections = [];
    
    // 1. Personal information (first 1000 chars only)
    const personalInfoSection = extractSection(cleanedContent, 0, 1000);
    if (personalInfoSection) {
      sections.push("=== PERSONAL INFORMATION ===");
      sections.push(personalInfoSection);
    }

    // 2. Work experience (much smaller limit)
    const experienceSection = extractExperienceSection(cleanedContent);
    if (experienceSection) {
      sections.push("=== WORK EXPERIENCE ===");
      sections.push(experienceSection.substring(0, 5000)); // Limit to 5K chars
    }

    // 3. Education section (smaller limit)
    const educationSection = extractEducationSection(cleanedContent);
    if (educationSection) {
      sections.push("=== EDUCATION ===");
      sections.push(educationSection.substring(0, 1500)); // Limit to 1.5K chars
    }

    // 4. Skills section (smaller limit)
    const skillsSection = extractSkillsSection(cleanedContent);
    if (skillsSection) {
      sections.push("=== SKILLS ===");
      sections.push(skillsSection.substring(0, 1500)); // Limit to 1.5K chars
    }

    // Combine sections and ensure we don't exceed the limit
    let combinedContent = sections.join('\n\n');
    
    // Final safety check - if still too large, truncate aggressively
    if (combinedContent.length > maxChars) {
      combinedContent = combinedContent.substring(0, maxChars - 100) + '\n\n[Content truncated for processing...]';
    }

    return combinedContent;
  }

  return cleanedContent;
}

/**
 * Extract a section of text starting from a position
 */
function extractSection(content: string, start: number, maxLength: number): string {
  return content.substring(start, Math.min(start + maxLength, content.length)).trim();
}

/**
 * Extract work experience section using common patterns
 */
function extractExperienceSection(content: string): string {
  const experiencePatterns = [
    /(?:work\s+)?experience|employment|professional\s+experience|career/i,
    /(?:work\s+)?history|employment\s+history/i,
    /positions?\s+held/i
  ];

  for (const pattern of experiencePatterns) {
    const match = content.search(pattern);
    if (match !== -1) {
      // Extract from the match position for up to 4000 characters (reduced from 8000)
      return extractSection(content, match, 4000);
    }
  }

  // Fallback: look for date patterns that might indicate experience
  const datePattern = /(19|20)\d{2}[\s\-–—]+(?:present|current|(19|20)\d{2})/gi;
  const dateMatches = Array.from(content.matchAll(datePattern));
  
  if (dateMatches.length > 0) {
    const firstMatch = dateMatches[0].index || 0;
    const startPos = Math.max(0, firstMatch - 200); // Start a bit before the first date (reduced from 500)
    return extractSection(content, startPos, 4000); // Reduced from 8000
  }

  return '';
}

/**
 * Extract education section using common patterns
 */
function extractEducationSection(content: string): string {
  const educationPatterns = [
    /education|academic|degree|university|college|school/i,
    /bachelor|master|phd|doctorate|certificate|diploma/i,
    /b\.?[sa]\.?|m\.?[sa]\.?|ph\.?d\.?/i
  ];

  for (const pattern of educationPatterns) {
    const match = content.search(pattern);
    if (match !== -1) {
      return extractSection(content, match, 3000);
    }
  }

  return '';
}

/**
 * Extract skills section using common patterns
 */
function extractSkillsSection(content: string): string {
  const skillsPatterns = [
    /skills|competencies|technologies|technical\s+skills/i,
    /programming|software|tools|languages/i,
    /proficient|experience\s+with|familiar\s+with/i
  ];

  for (const pattern of skillsPatterns) {
    const match = content.search(pattern);
    if (match !== -1) {
      return extractSection(content, match, 3000);
    }
  }

  return '';
}

/**
 * Server action to add a new resume to the database with AI parsing
 * @param content - Resume content as text
 * @param cmetadata - Optional metadata for the resume
 * @returns Promise<ResumeData> - The created resume data
 */
export async function addResume(
  content: string,
  cmetadata?: Partial<ResumeData["cmetadata"]>
): Promise<ResumeData> {
  try {
    if (!content.trim()) {
      throw new Error("Resume content cannot be empty");
    }

    // Clean the content to ensure it's safe for database storage
    // Remove null bytes and other control characters that can cause UTF-8 errors
    const cleanContent = content
      .replace(/\0/g, '') // Remove null bytes (0x00)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove other control characters
      .replace(/\uFFFD/g, '') // Remove replacement characters (invalid UTF-8)
      .trim();

    if (!cleanContent) {
      throw new Error("Resume content is empty after cleaning");
    }

    console.log("Processing resume content:", {
      originalLength: content.length,
      cleanedLength: cleanContent.length,
      hasNullBytes: content.includes('\0'),
    });

    // Extract and limit content for AI parsing to stay within token limits (even Claude has limits!)
    const limitedContent = extractResumeContent(cleanContent);
    console.log("Content extraction:", {
      originalLength: cleanContent.length,
      extractedLength: limitedContent.length,
      reductionRatio: `${((1 - limitedContent.length / cleanContent.length) * 100).toFixed(1)}%`,
    });

    // Parse the resume content using Claude with limited content
    console.log("Using Claude 3.5 Sonnet for resume parsing with intelligent content extraction");
    let parseResult;
    try {
      parseResult = await parseResume(limitedContent);
    } catch (error) {
      console.error("Resume parsing error:", error);
      if (error instanceof Error) {
        console.error("Error details:", {
          message: error.message,
          cause: error.cause,
          stack: error.stack,
        });
      }
      
      // Try to extract just the basic information if AI parsing fails
      console.log("Falling back to basic parsing");
      parseResult = {
        object: {
          personalInformation: {
            name: "Unknown",
            position: {
              title: "Unknown",
              seniority: "mid" as const
            }
          },
          experiences: [],
          education: [],
          skills: [],
          softSkills: []
        }
      };
    }
    const parsedData = parseResult.object;

    // Combine AI-parsed data with any additional metadata provided
    const combinedCmetadata = {
      // AI-parsed data
      name: parsedData.personalInformation?.name,
      title: parsedData.experiences?.[0]?.title, // Use the most recent job title
      summary: `${parsedData.experiences?.length || 0} years of experience. Education: ${parsedData.education?.map(edu => `${edu.degree} in ${edu.field}`).join(', ') || 'Not specified'}`,
      
      // Structured parsed data for future use
      ...parsedData,
      
      // Additional metadata (can override AI-parsed data if provided)
      ...cmetadata,
      
      // Always include upload timestamp
      uploadedAt: new Date().toISOString(),
    };

    console.log("Adding resume with metadata:", combinedCmetadata);

    // Create the resume in the database with AI-parsed metadata
    // const resume = await prisma.resume.create({
    //   data: {
    //     document: JSON.stringify(parsedData),
    //     cmetadata: combinedCmetadata,
    //   },
    //   select: {
    //     id: true,
    //     document: true,
    //     cmetadata: true,
    //   },
    // });

    const id = generateId();

    // Chunk the content for vector storage to avoid token limits
    // Use the limited content for vector storage to ensure consistency with parsing
    const chunks = chunkText(JSON.stringify(parsedData), 20000, 150); // Smaller chunks for embeddings
    console.log(`Chunking resume into ${chunks.length} pieces for vector storage`);

    // Add each chunk to vector store with metadata including the resume ID
    const chunkMetadata = chunks.map(() => ({ 
      ...combinedCmetadata, 
      id, // Include the resume ID in metadata for vector search
    }));
    
    await addVectors(chunks, chunkMetadata);

    return {
      id,
      document: JSON.stringify(parsedData),
      cmetadata: combinedCmetadata,
    };
  } catch (error) {
    console.error("Error adding resume:", error);
    throw new Error("Failed to add resume");
  }
}

export async function parseResume(resumeText: string) {
  return generateObject({
    model: anthropic("claude-sonnet-4-20250514"), // Claude 3.5 Sonnet with 200K token context window
    schema: ResumeSchema,
    prompt: `Parse the following resume text and extract structured information according to the schema. If information is not available, omit the optional fields.

Focus on extracting:
- Personal information (name, contact details, current position)
- Work experience with dates, companies, and achievements
- Education background
- Technical skills with proficiency levels
- Soft skills and personality traits

For the position.seniority field, ONLY use one of these exact values:
- "entry" - for entry-level positions or new graduates
- "junior" - for 1-3 years of experience
- "mid" - for 3-6 years of experience (use this as default if unclear)
- "senior" - for 6-10 years of experience
- "lead" - for team lead or senior individual contributor roles
- "principal" - for principal engineer or similar high-level IC roles
- "director" - for director-level management
- "vp" - for VP-level positions
- "c-level" - for C-suite executives

If you cannot determine the seniority level, use "mid".

Resume text:
${resumeText}`,
  });
}
