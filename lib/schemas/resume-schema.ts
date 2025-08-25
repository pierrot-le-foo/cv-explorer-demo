import { z } from "zod";

// Zod schema for resume parsing
export const ResumeSchema = z.object({
  personalInformation: z.object({
    name: z.string().describe("Full name of the person"),
    email: z.string().email().optional().describe("Email address"),
    phone: z.string().optional().describe("Phone number"),
    address: z.string().optional().describe("Physical address"),
    website: z.string().url().optional().describe("Personal website URL"),
    linkedin: z.string().url().optional().describe("LinkedIn profile URL"),
    position: z.object({
      title: z.string().describe("Current or desired job title/position"),
      seniority: z
        .enum([
          "entry",
          "junior",
          "mid",
          "senior",
          "lead",
          "principal",
          "director",
          "vp",
          "c-level"
        ])
        .describe("Seniority level for this position"),
    }).optional().describe("Current or target position information"),
  }),
  experiences: z
    .array(
      z.object({
        title: z.string().describe("Job title or position"),
        company: z.string().describe("Company name"),
        location: z.string().optional().describe("Work location"),
        startDate: z.string().describe("Start date (month/year format)"),
        endDate: z
          .string()
          .optional()
          .describe('End date (month/year format) or "Present"'),
        description: z
          .string()
          .optional()
          .describe("Job description and responsibilities"),
        achievements: z
          .array(z.string())
          .optional()
          .describe("Key achievements and accomplishments"),
      })
    )
    .describe("Work experience history"),
  education: z
    .array(
      z.object({
        degree: z
          .string()
          .describe("Degree type (e.g., Bachelor of Science, Master of Arts)"),
        field: z.string().describe("Field of study or major"),
        institution: z.string().describe("School/University name"),
        location: z.string().optional().describe("Institution location"),
        graduationDate: z
          .string()
          .optional()
          .describe("Graduation date (month/year format)"),
        gpa: z.string().optional().describe("GPA if mentioned"),
        honors: z
          .array(z.string())
          .optional()
          .describe("Academic honors, awards, or distinctions"),
      })
    )
    .describe("Educational background"),
  softSkills: z
    .array(z.string())
    .optional()
    .describe("Soft skills and character traits that provide insights into the candidate's personality, communication style, leadership abilities, and interpersonal skills (e.g., leadership, teamwork, communication, problem-solving, adaptability, creativity, emotional intelligence)"),
  skills: z
    .array(
      z.object({
        name: z.string().describe("Name of the skill or technology"),
        category: z
          .enum([
            "programming",
            "framework",
            "database",
            "cloud",
            "devops",
            "design",
            "language",
            "other"
          ])
          .optional()
          .describe("Category of the skill"),
        seniority: z
          .enum([
            "beginner",
            "intermediate", 
            "advanced",
            "expert"
          ])
          .optional()
          .describe("Proficiency level in this skill"),
        yearsOfExperience: z
          .number()
          .optional()
          .describe("Number of years of experience with this skill"),
      })
    )
    .optional()
    .describe("Technical skills, tools, technologies, and other competencies with their proficiency levels"),
});
