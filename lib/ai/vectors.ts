import { PGVectorStore, DistanceStrategy } from "@langchain/community/vectorstores/pgvector";
import { OpenAIEmbeddings } from "@langchain/openai";
import { PoolConfig } from "pg";
import { Document } from "@langchain/core/documents";
import { v4 as uuidv4 } from "uuid";

// Configure the PGVector store using our existing database connection
function getDatabaseConfig(): PoolConfig {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (databaseUrl) {
    // Parse the DATABASE_URL
    const url = new URL(databaseUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port),
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1), // Remove leading slash
    };
  }
  
  // Fallback to individual environment variables
  return {
    host: process.env.POSTGRES_HOST || "127.0.0.1",
    port: parseInt(process.env.POSTGRES_PORT || "5490"),
    user: process.env.POSTGRES_USER || "user",
    password: process.env.POSTGRES_PASSWORD || "password", 
    database: process.env.POSTGRES_DB || "cv_explorer",
  };
}

const config = {
  postgresConnectionOptions: getDatabaseConfig(),
  tableName: "langchain_pg_embedding", // This matches our Resume model mapping
  columns: {
    idColumnName: "id",
    vectorColumnName: "embedding",
    contentColumnName: "document",
    metadataColumnName: "cmetadata",
  },
  distanceStrategy: "cosine" as DistanceStrategy,
};

// Singleton pattern for vector store
let vectorStoreInstance: PGVectorStore | null = null;

export async function getVectorStore(): Promise<PGVectorStore> {
  if (!vectorStoreInstance) {
    const embeddings = new OpenAIEmbeddings({
      model: "text-embedding-3-large"
    });
    
    // Initialize the vector store (creates table if it doesn't exist)
    vectorStoreInstance = await PGVectorStore.initialize(embeddings, config);
  }
  
  return vectorStoreInstance;
}

export async function addVectors(chunks: string[], metadata: Record<string, unknown>[] = []): Promise<void> {
  const vectorStore = await getVectorStore();
  
  const documents: Document[] = chunks.map((chunk, index) => ({
    pageContent: chunk,
    metadata: metadata[index] || {},
  }));
  
  const ids = chunks.map(() => uuidv4());
  
  const res = await vectorStore.addDocuments(documents, { ids });

  console.log(res)

  return res
}

/**
 * Chunk text into smaller pieces suitable for embedding
 * @param text - The text to chunk
 * @param maxChunkSize - Maximum characters per chunk (default: 2000)
 * @param overlap - Number of characters to overlap between chunks (default: 200)
 * @returns Array of text chunks
 */
export function chunkText(text: string, maxChunkSize: number = 2000, overlap: number = 200): string[] {
  if (!text || text.length <= maxChunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxChunkSize;
    
    // If this isn't the last chunk, try to find a good breaking point
    if (end < text.length) {
      // Look for sentence endings near the end of the chunk
      const sentenceEnd = text.lastIndexOf('.', end);
      const questionEnd = text.lastIndexOf('?', end);
      const exclamationEnd = text.lastIndexOf('!', end);
      
      const bestEnd = Math.max(sentenceEnd, questionEnd, exclamationEnd);
      
      // If we found a sentence ending within reasonable distance, use it
      if (bestEnd > start + maxChunkSize * 0.7) {
        end = bestEnd + 1;
      } else {
        // Otherwise, look for word boundaries
        const spaceIndex = text.lastIndexOf(' ', end);
        if (spaceIndex > start + maxChunkSize * 0.5) {
          end = spaceIndex;
        }
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    // Move start position, accounting for overlap
    start = Math.max(start + 1, end - overlap);
  }

  return chunks;
}

export async function searchVectors(
  query: string, 
  k: number = 5,
  filter?: Record<string, unknown>
): Promise<Document[]> {
  const vectorStore = await getVectorStore();
  return await vectorStore.similaritySearch(query, k, filter);
}

export async function searchVectorsWithScore(
  query: string, 
  k: number = 5,
  filter?: Record<string, unknown>
): Promise<[Document, number][]> {
  const vectorStore = await getVectorStore();
  return await vectorStore.similaritySearchWithScore(query, k, filter);
}

// Create HNSW index for better performance (call this once after adding many documents)
export async function createHnswIndex(dimensions: number = 1536): Promise<void> {
  const vectorStore = await getVectorStore();
  await vectorStore.createHnswIndex({
    dimensions,
    efConstruction: 64,
    m: 16,
  });
}

// Close the vector store connection
export async function closeVectorStore(): Promise<void> {
  if (vectorStoreInstance) {
    await vectorStoreInstance.end();
    vectorStoreInstance = null;
  }
}
