'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getResumes, searchResumes, semanticSearchResumes, getResumeById, addResume, type ResumeData } from '@/lib/actions/resumes';

// Query keys for consistent cache management
export const resumeKeys = {
  all: ['resumes'] as const,
  lists: () => [...resumeKeys.all, 'list'] as const,
  list: (filters: string) => [...resumeKeys.lists(), { filters }] as const,
  details: () => [...resumeKeys.all, 'detail'] as const,
  detail: (id: string) => [...resumeKeys.details(), id] as const,
};

/**
 * Hook to fetch all resumes
 */
export function useResumes() {
  return useQuery({
    queryKey: resumeKeys.lists(),
    queryFn: getResumes,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to search resumes
 * @param query - Search query string
 */
export function useSearchResumes(query: string) {
  return useQuery({
    queryKey: resumeKeys.list(query),
    queryFn: () => searchResumes(query),
    enabled: !!query.trim(), // Only run query if there's a search term
    staleTime: 1000 * 60 * 2, // 2 minutes for search results
  });
}

/**
 * Hook to fetch a specific resume by ID
 * @param id - Resume ID
 */
export function useResume(id: string) {
  return useQuery({
    queryKey: resumeKeys.detail(id),
    queryFn: () => getResumeById(id),
    enabled: !!id, // Only run if ID is provided
    staleTime: 1000 * 60 * 10, // 10 minutes for individual resumes
  });
}

/**
 * Hook to search resumes using semantic vector search
 * @param query - Search query string
 * @param limit - Maximum number of results (default: 5)
 */
export function useSemanticSearchResumes(query: string, limit: number = 5) {
  return useQuery({
    queryKey: [...resumeKeys.list(query), 'semantic', limit],
    queryFn: () => semanticSearchResumes(query, limit),
    enabled: !!query.trim(), // Only run query if there's a search term
    staleTime: 1000 * 60 * 2, // 2 minutes for search results
  });
}

/**
 * Hook to invalidate resume queries (useful after uploads or updates)
 */
export function useInvalidateResumes() {
  const queryClient = useQueryClient();
  
  return {
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: resumeKeys.all }),
    invalidateLists: () => queryClient.invalidateQueries({ queryKey: resumeKeys.lists() }),
    invalidateDetail: (id: string) => queryClient.invalidateQueries({ queryKey: resumeKeys.detail(id) }),
  };
}

/**
 * Hook for uploading a new resume with content and metadata
 */
export function useUploadResume() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ content, cmetadata }: { 
      content: string; 
      cmetadata?: ResumeData['cmetadata'] 
    }) => {
      return await addResume(content, cmetadata);
    },
    onSuccess: () => {
      // Invalidate and refetch resume list after successful upload
      queryClient.invalidateQueries({ queryKey: resumeKeys.lists() });
    },
    onError: (error) => {
      console.error('Error uploading resume:', error);
    },
  });
}

/**
 * Hook for parsing resume text content using AI
 */
export function useParseResume() {
  return useMutation({
    mutationFn: async (resumeText: string) => {
      const response = await fetch('/api/resume/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ resumeText }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to parse resume');
      }

      const data = await response.json();
      return data.data; // Return the parsed resume object
    },
    onError: (error) => {
      console.error('Error parsing resume:', error);
    },
  });
}
