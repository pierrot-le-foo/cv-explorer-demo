import { searchVectors } from '@/lib/ai/vectors';
import { semanticSearchResumes } from '@/lib/actions/resumes';
import { openai } from '@ai-sdk/openai';
import { streamText, UIMessage, convertToModelMessages, stepCountIs, tool, generateObject } from 'ai';
import z from 'zod';

// Schema for parsing user search queries into structured criteria
const SearchCriteriaSchema = z.object({
  position: z.object({
    title: z.string().optional().describe("Job title or role being searched for"),
    seniority: z.enum(["entry", "junior", "mid", "senior", "lead", "principal", "director", "vp", "c-level"]).optional(),
  }).optional(),
  skills: z.array(z.object({
    name: z.string(),
    category: z.enum(["programming", "framework", "database", "cloud", "devops", "design", "language", "other"]).optional(),
    minSeniority: z.enum(["beginner", "intermediate", "advanced", "expert"]).optional(),
  })).optional().describe("Required technical skills"),
  experience: z.object({
    minYears: z.number().optional().describe("Minimum years of experience"),
    maxYears: z.number().optional().describe("Maximum years of experience"),
    companies: z.array(z.string()).optional().describe("Specific companies mentioned"),
    industries: z.array(z.string()).optional().describe("Industry experience required"),
  }).optional(),
  education: z.object({
    degree: z.string().optional().describe("Required degree level"),
    field: z.string().optional().describe("Field of study"),
    institution: z.string().optional().describe("Specific institution"),
  }).optional(),
  location: z.string().optional().describe("Geographic location requirements"),
  softSkills: z.array(z.string()).optional().describe("Required soft skills"),
});

// Parse user query into structured search criteria
async function parseSearchQuery(query: string) {
  try {
    const result = await generateObject({
      model: openai('gpt-4o'),
      schema: SearchCriteriaSchema,
      prompt: `Parse the following job search query into structured criteria. Extract only the information that is explicitly mentioned or clearly implied. If something is not mentioned, omit it from the response.

Query: "${query}"

Instructions:
- Extract position title and seniority level if mentioned
- Identify required technical skills and their minimum proficiency levels
- Extract experience requirements (years, companies, industries)
- Identify education requirements if mentioned
- Extract location requirements if specified
- Identify soft skills if mentioned

Example:
"Find me a senior React developer with 5+ years experience at Google" would become:
{
  position: { title: "React developer", seniority: "senior" },
  skills: [{ name: "React", category: "framework", minSeniority: "advanced" }],
  experience: { minYears: 5, companies: ["Google"] }
}`,
    });
    
    return result.object;
  } catch (error) {
    console.error("Failed to parse search query:", error);
    return null;
  }
}

// Generate detailed match analysis for a candidate
async function generateMatchAnalysis(
  parsedCriteria: unknown,
  resumeData: unknown,
  originalQuery: string,
  semanticScore: number
) {
  try {
    const analysisResult = await generateObject({
      model: openai('gpt-4o'),
      schema: z.object({
        percentage: z.number().min(0).max(100).describe("Overall match percentage"),
        explanation: z.string().describe("Brief explanation of why this candidate matches"),
        details: z.object({
          positionMatch: z.number().min(0).max(100).optional().describe("Position/title match percentage"),
          seniorityMatch: z.number().min(0).max(100).optional().describe("Seniority level match percentage"),
          skillsMatch: z.number().min(0).max(100).optional().describe("Technical skills match percentage"),
          experienceMatch: z.number().min(0).max(100).optional().describe("Experience requirements match percentage"),
          educationMatch: z.number().min(0).max(100).optional().describe("Education requirements match percentage"),
          locationMatch: z.number().min(0).max(100).optional().describe("Location requirements match percentage"),
          softSkillsMatch: z.number().min(0).max(100).optional().describe("Soft skills match percentage"),
          keyStrengths: z.array(z.string()).describe("Key strengths that make this candidate a good match"),
          potentialConcerns: z.array(z.string()).describe("Potential concerns or gaps"),
        }).describe("Detailed breakdown of match criteria")
      }),
      prompt: `Analyze how well this candidate matches the search criteria and provide a detailed explanation.

SEARCH CRITERIA:
${JSON.stringify(parsedCriteria, null, 2)}

ORIGINAL QUERY: "${originalQuery}"

CANDIDATE DATA:
${JSON.stringify(resumeData, null, 2)}

SEMANTIC SIMILARITY SCORE: ${semanticScore} (0.0-1.0 scale)

Instructions:
1. Calculate an overall match percentage (0-100%) considering all criteria
2. Provide a brief, clear explanation of why this candidate matches
3. Break down the match by category (position, seniority, skills, experience, etc.)
4. Identify key strengths that make them a good fit
5. Note any potential concerns or gaps
6. Weight the semantic similarity score as part of your analysis
7. Be honest about gaps - a 100% match is rare and should only be given to near-perfect matches

Focus on practical relevance rather than perfect keyword matching.`,
    });
    
    return analysisResult.object;
  } catch (error) {
    console.error("Failed to generate match analysis:", error);
    
    // Fallback to simple scoring
    const fallbackPercentage = Math.min(100, Math.max(0, semanticScore * 100));
    return {
      percentage: Math.round(fallbackPercentage),
      explanation: "Match based on semantic similarity to your search criteria.",
      details: {
        keyStrengths: ["Semantic similarity to search query"],
        potentialConcerns: ["Detailed analysis unavailable"],
      }
    };
  }
}

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    messages: convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    system: `You are a helpful AI assistant specialized in CV/Resume screening and analysis. 
    You have access to a database of resumes and can search through them to find candidates matching specific criteria.
    
    When users ask about finding candidates, use the searchResumes tool to find relevant resumes based on their requirements.
    Provide detailed insights about the candidates found, including their experience, skills, and suitability for the role.
    
    If no relevant information is found in the tool calls, respond with helpful suggestions on how to refine the search.`,
    tools: {
      searchResumes: tool({
        description: `Search through the resume database to find candidates matching specific criteria. Use this for questions about finding candidates, skills, experience, or job requirements.`,
        inputSchema: z.object({
          query: z.string().describe('The search query describing the candidate requirements, skills, or job criteria'),
          limit: z.number().optional().default(5).describe('Maximum number of resumes to return (default: 5)'),
          useStructuredSearch: z.boolean().optional().default(true).describe('Whether to parse the query into structured criteria for better matching'),
        }),
        execute: async ({ query, limit = 5, useStructuredSearch = true }) => {
          let searchQuery = query;
          let parsedCriteria = null;
          
          // Parse query into structured criteria if requested
          if (useStructuredSearch) {
            parsedCriteria = await parseSearchQuery(query);
            
            if (parsedCriteria) {
              // Convert structured criteria back to an enhanced search query
              const enhancedQueryParts = [];
              
              if (parsedCriteria.position?.title) {
                enhancedQueryParts.push(`position: ${parsedCriteria.position.title}`);
              }
              
              if (parsedCriteria.position?.seniority) {
                enhancedQueryParts.push(`seniority: ${parsedCriteria.position.seniority}`);
              }
              
              if (parsedCriteria.skills?.length) {
                const skillsText = parsedCriteria.skills.map(skill => {
                  let skillText = skill.name;
                  if (skill.minSeniority) skillText += ` (${skill.minSeniority} level)`;
                  if (skill.category) skillText += ` [${skill.category}]`;
                  return skillText;
                }).join(", ");
                enhancedQueryParts.push(`skills: ${skillsText}`);
              }
              
              if (parsedCriteria.experience?.minYears) {
                enhancedQueryParts.push(`minimum ${parsedCriteria.experience.minYears} years experience`);
              }
              
              if (parsedCriteria.experience?.companies?.length) {
                enhancedQueryParts.push(`companies: ${parsedCriteria.experience.companies.join(", ")}`);
              }
              
              if (parsedCriteria.education?.degree) {
                enhancedQueryParts.push(`education: ${parsedCriteria.education.degree}`);
              }
              
              if (parsedCriteria.education?.field) {
                enhancedQueryParts.push(`field: ${parsedCriteria.education.field}`);
              }
              
              if (parsedCriteria.location) {
                enhancedQueryParts.push(`location: ${parsedCriteria.location}`);
              }
              
              if (parsedCriteria.softSkills?.length) {
                enhancedQueryParts.push(`soft skills: ${parsedCriteria.softSkills.join(", ")}`);
              }
              
              if (enhancedQueryParts.length > 0) {
                searchQuery = enhancedQueryParts.join(" | ");
              }
            }
          }
          
          const resumes = await semanticSearchResumes(searchQuery, limit);
          
          // Calculate match confidence and generate explanations
          const resultsWithConfidence = await Promise.all(resumes.map(async (resume) => {
            // Extract score from summary (temporary until we modify the backend)
            const scoreMatch = resume.cmetadata?.summary?.match(/Score: ([\d.]+)/);
            const rawScore = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
            
            // Parse the stored resume data to analyze match criteria
            let resumeData;
            try {
              resumeData = typeof resume.document === 'string' 
                ? JSON.parse(resume.document) 
                : resume.document;
            } catch {
              resumeData = {};
            }
            
            // Generate detailed match analysis
            const matchAnalysis = await generateMatchAnalysis(parsedCriteria, resumeData, query, rawScore);
            
            return {
              id: resume.id,
              name: resume.cmetadata?.name || 'Unknown',
              title: resume.cmetadata?.title || 'No title',
              summary: resume.cmetadata?.summary?.replace(/Score: [\d.]+ - /, '') || 'No summary',
              content: resume.document.substring(0, 500) + '...',
              confidence: matchAnalysis.percentage,
              rawScore: rawScore,
              matchExplanation: matchAnalysis.explanation,
              matchDetails: matchAnalysis.details
            };
          }));
          
          // Calculate overall confidence
          const avgConfidence = resultsWithConfidence.length > 0 
            ? Math.round(resultsWithConfidence.reduce((sum, r) => sum + r.confidence, 0) / resultsWithConfidence.length)
            : 0;
          
          return {
            totalResults: resultsWithConfidence.length,
            averageConfidence: avgConfidence,
            query: searchQuery,
            originalQuery: query,
            parsedCriteria: parsedCriteria,
            candidates: resultsWithConfidence
          };
        },
      }),
      getInformation: tool({
        description: `Get general information from the knowledge base for non-resume related questions.`,
        inputSchema: z.object({
          question: z.string().describe('The users question'),
        }),
        execute: async ({ question }) => {
          const results = await searchVectors(question);
          return results.map(doc => doc.pageContent);
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
  });
}