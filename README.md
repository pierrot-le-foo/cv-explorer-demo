# CV Explorer - AI-Powered Resume Screening Application

An intelligent resume screening application built with Next.js 15, featuring AI-powered chat interactions and semantic search capabilities. This project demonstrates a complete RAG (Retrieval-Augmented Generation) pipeline for processing and querying resume data.

## 🎯 Project Overview

CV Explorer is a full-stack application that allows users to chat with an AI assistant about a collection of resumes. The system processes PDF resumes, extracts structured information using AI, and provides intelligent responses to user queries through a clean chat interface.

## 🛠 Technical Architecture

### Frontend Stack
- **Next.js 15** with App Router and Turbopack
- **Vercel AI SDK** for chat functionality and AI integrations
- **Vercel AI Elements** for pre-built chat UI components
- **Tailwind CSS v4** with Radix UI components for styling
- **TypeScript** for type safety

### Backend & AI Pipeline
- **PostgreSQL** with **pgvector** extension for vector similarity search
- **Prisma ORM** with custom client configuration
- **LangChain** for document processing and vector operations
- **OpenAI GPT-4o** for chat conversations
- **Claude 3.5 Sonnet** for resume parsing and data manipulation
- **Zod schemas** for structured data validation

### Data Generation
- **Python script** with **Google Gemini** for AI-generated profile images
- **Google Colab** environment for resume generation
- Generated 25+ realistic PDF resumes with photos, contact info, experience, and skills

## 🔑 Key Features

### 1. Intelligent Resume Processing
- **PDF Text Extraction**: Converts PDF resumes to searchable text
- **AI-Powered Parsing**: Uses Claude 3.5 Sonnet to extract structured data
- **Schema Validation**: Enforces consistent data structure using Zod schemas
- **Vector Embeddings**: Creates semantic embeddings for similarity search

### 2. Advanced Chat Interface
- **Split-pane Layout**: Chat interface alongside resume browser
- **Streaming Responses**: Real-time AI responses with proper loading states
- **Structured Queries**: Converts natural language to structured search criteria
- **Source Attribution**: Links responses back to specific resumes

### 3. Semantic Search & RAG
- **Vector Similarity Search**: Uses pgvector for finding relevant resumes
- **Hybrid Search**: Combines semantic similarity with structured filtering
- **Context-Aware Responses**: Provides detailed analysis with match scores
- **Intelligent Content Extraction**: Optimizes large PDFs for AI processing

## 🧠 Why Object Generation & Structured Schemas?

### Benefits of Structured Data Approach

**1. Improved Accuracy & Consistency**
- Zod schemas ensure all resume data follows the same structure
- AI responses are more reliable when working with structured data
- Eliminates parsing errors and data inconsistencies

**2. Enhanced Search Capabilities**
- User queries are converted to structured search criteria
- Enables precise filtering by experience level, skills, education, etc.
- Combines semantic search with exact field matching

**3. Better AI Performance**
- Structured prompts lead to more accurate AI parsing
- Consistent data format improves LLM understanding
- Reduces hallucinations by providing clear data boundaries

**4. Scalability & Maintainability**
- Easy to add new fields or modify data structure
- Type-safe operations throughout the application
- Simplified data validation and error handling

**Example Schema Structure:**
```typescript
const ResumeSchema = z.object({
  personalInformation: z.object({
    name: z.string(),
    email: z.string().email().optional(),
    position: z.object({
      title: z.string(),
      seniority: z.enum(["entry", "junior", "mid", "senior", "lead", "principal"])
    }).optional()
  }),
  experiences: z.array(z.object({
    title: z.string(),
    company: z.string(),
    startDate: z.string(),
    endDate: z.string().optional(),
    achievements: z.array(z.string()).optional()
  })),
  // ... additional fields
});
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and pnpm
- Docker and Docker Compose
- OpenAI API key
- Anthropic API key (for Claude)

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd cv-explorer/typescript
```

2. **Install dependencies**
```bash
pnpm install
```

3. **Start the database**
```bash
docker-compose up -d
```

4. **Set up environment variables**
```bash
cp .env.example .env
# Add your API keys:
# OPENAI_API_KEY=your_openai_key
# ANTHROPIC_API_KEY=your_anthropic_key
# DATABASE_URL=postgresql://user:password@localhost:5490/cvexplorer
```

5. **Initialize the database**
```bash
pnpm prisma migrate dev
pnpm prisma db seed
```

6. **Start the development server**
```bash
pnpm dev
```

Visit `http://localhost:3000` to access the application.

## 📥 Bulk Resume Import

The project includes a powerful script to import all PDF resumes from the `public/resumes/` directory into the database:

### Import Script Usage

```bash
# Import all PDFs from public/resumes/ directory
npx tsx scripts/import-all-resumes.ts

# Show help information
npx tsx scripts/import-all-resumes.ts --help
```

### Import Process
The script automatically:
1. **Scans** all PDF files in `public/resumes/`
2. **Extracts** text content using the same logic as the upload API
3. **Processes** each resume with Claude AI for structured parsing
4. **Stores** in PostgreSQL with vector embeddings for semantic search
5. **Reports** detailed progress and summary statistics

### Import Output Example
```
🚀 Starting bulk resume import...
📁 Scanning directory: /path/to/public/resumes
📄 Found 12 PDF files to process

📋 [1/12] Processing: john_doe_resume.pdf
   🔍 Reading file: /path/to/public/resumes/john_doe_resume.pdf
   ✅ File read successfully (0.85 MB)
   📖 Extracting text from PDF...
   ✅ Text extraction successful (15,234 characters)
   🤖 Processing with AI and saving to database...
   ✅ Successfully processed: John Doe - Senior Software Engineer [abc123]

================================================================================
📊 IMPORT SUMMARY
================================================================================
📅 Completed at: 2025-08-25T10:30:45.123Z
⏱️  Total time: 45.67 seconds
📄 Total files: 12
✅ Successfully imported: 11
❌ Failed: 1
⏭️  Skipped: 0
🎉 All files processed successfully!
```

This script is essential for initial data setup and bulk resume processing.

## 📊 Resume Generation

The resume dataset was generated using a Python script running in Google Colab:

**🔗 [Resume Generation Notebook](https://colab.research.google.com/drive/1HxhpF7V9ZvanlAAZYuWQzafTMIx0hhoU?usp=sharing)**

### Generation Process
- **AI Content Generation**: Creates realistic work experience, skills, and education
- **Profile Image Generation**: Uses Google Gemini to generate professional headshots
- **PDF Creation**: Formats content into professional resume layouts
- **Diversity**: Generates candidates across various roles, experience levels, and backgrounds

## 🔍 How It Works

### 1. Resume Upload & Processing
```mermaid
graph LR
    A[PDF Upload] --> B[Text Extraction]
    B --> C[Content Cleaning]
    C --> D[AI Parsing with Claude]
    D --> E[Schema Validation]
    E --> F[Vector Embedding]
    F --> G[Database Storage]
```

### 2. Query Processing & Response
```mermaid
graph LR
    A[User Query] --> B[Intent Analysis]
    B --> C[Structured Search Criteria]
    C --> D[Vector Similarity Search]
    D --> E[Candidate Matching]
    E --> F[AI Analysis with OpenAI]
    F --> G[Structured Response]
```

## 🛠 API Endpoints

- `POST /api/resume/upload` - Upload and process PDF resumes
- `POST /api/resume/parse` - Parse resume content using AI
- `POST /api/chat` - Chat interface for resume queries

## 🔧 Key Technologies

### AI & ML
- **[Vercel AI SDK](https://ai-sdk.dev/)** - Unified interface for LLM integrations
- **[AI Elements](https://ai-sdk.dev/elements/overview)** - Pre-built chat UI components
- **OpenAI GPT-4o** - Conversational AI and query understanding
- **Claude 3.5 Sonnet** - Document parsing and structured data extraction

### Database & Search
- **PostgreSQL** with **pgvector** - Vector similarity search
- **Prisma ORM** - Type-safe database operations
- **LangChain** - Document processing and embedding pipeline

### Frontend & UI
- **Next.js 15** - React framework with App Router
- **Tailwind CSS v4** - Utility-first styling
- **Radix UI** - Accessible component primitives

## 📁 Project Structure

```
├── app/                    # Next.js app router
│   ├── api/               # API routes
│   └── page.tsx           # Main application page
├── components/            # React components
│   ├── ai-elements/       # AI SDK UI components
│   └── ui/               # Custom UI components
├── lib/                   # Utility functions
│   ├── actions/          # Server actions
│   ├── ai/               # AI and vector operations
│   └── schemas/          # Zod validation schemas
├── prisma/               # Database schema and migrations
└── public/resumes/       # Sample resume PDFs
```

## 🎥 Demo

The application demonstrates:
- **Resume Upload**: Process PDF resumes with AI extraction
- **Intelligent Search**: "Who has Python experience?" → Structured candidate matching
- **Detailed Analysis**: Comprehensive candidate profiles with match scores
- **Source Attribution**: Direct links to relevant resume sections

## 🧪 Sample Queries

Try these example questions:
- "Who has experience with Python and machine learning?"
- "Which candidates graduated from top universities?"
- "Find senior developers with React experience"
- "Summarize the profile of [candidate name]"
- "Who would be best for a startup environment?"

## 🚢 Deployment

The application is ready for deployment on platforms like Vercel, with environment variables configured for production database and API keys.

## 🤝 Contributing

This project demonstrates modern AI application development patterns and is open for educational purposes and contributions.

---

Built with ❤️ using Next.js, Vercel AI SDK, and Claude/OpenAI

