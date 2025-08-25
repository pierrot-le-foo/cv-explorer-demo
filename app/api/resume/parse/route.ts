import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { ResumeSchema } from "@/lib/schemas/resume-schema";

// Export the schema type for use in other parts of the application
export type Resume = z.infer<typeof ResumeSchema>;

export async function POST(request: Request) {
  try {
    const { resumeText } = await request.json();

    if (!resumeText) {
      return Response.json(
        { error: "Resume text is required" },
        { status: 400 }
      );
    }

    const result = await generateObject({
      model: openai("gpt-4o"),
      schema: ResumeSchema,
      prompt: `Parse the following resume text and extract structured information according to the schema. If information is not available, omit the optional fields:

${resumeText}`,
    });

    return Response.json({
      success: true,
      data: result.object,
    });
  } catch (error) {
    console.error("Error parsing resume:", error);
    return Response.json({ error: "Failed to parse resume" }, { status: 500 });
  }
}
