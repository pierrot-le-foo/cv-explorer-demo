import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Search } from 'lucide-react';
import { useResumes, useSemanticSearchResumes } from '@/lib/hooks/useResumes';

const Resumes: React.FC = () => {
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Use React Query hooks for data fetching
  const { data: resumes = [], isLoading, error } = useResumes();
  const { data: searchResults, isLoading: isSearching } = useSemanticSearchResumes(searchQuery, 10);

  // Use search results if searching, otherwise use all resumes
  const displayedResumes = searchQuery.trim() ? (searchResults || []) : resumes;
  const isDisplayLoading = searchQuery.trim() ? isSearching : isLoading;

  const handleSearch = () => {
    setSearchQuery(searchInput.trim());
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setSearchQuery('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // Handle loading and error states
  if (error) {
    return (
      <div className="h-full flex flex-col p-6 bg-background text-foreground">
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <p className="text-destructive mb-2">Error loading resumes</p>
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 bg-background text-foreground">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-foreground">Resumes</h2>
      </div>
      
      <div className="flex gap-2 mb-4">
        <Input
          type="text"
          placeholder="Search resumes using AI semantic search..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyPress={handleKeyPress}
          className="flex-1"
        />
        <Button 
          onClick={handleSearch}
          disabled={isSearching || !searchInput.trim()}
          className="px-4"
        >
          {isSearching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </Button>
        {searchQuery && (
          <Button 
            variant="outline"
            onClick={handleClearSearch}
            className="px-4"
          >
            Clear
          </Button>
        )}
      </div>
      
      {searchQuery.trim() && (
        <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
          🔍 AI semantic search results for: &quot;{searchQuery}&quot;
        </div>
      )}
      
      <div className="flex-1 overflow-y-auto">
        {isDisplayLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">
              {searchQuery.trim() ? 'Searching resumes...' : 'Loading resumes...'}
            </span>
          </div>
        ) : (
          <ul className="space-y-4">
            {displayedResumes.map((resume) => (
              <li key={resume.id} className="pb-4 border-b border-border last:border-b-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="font-semibold text-foreground">
                      {resume.cmetadata?.name || 'Unknown Name'}
                    </div>
                    <div className="text-sm text-muted-foreground mb-1">
                      {resume.cmetadata?.title || 'No Title'}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {resume.cmetadata?.summary || 'No summary available'}
                    </p>
                    {resume.cmetadata?.fileName && (
                      <div className="text-xs text-muted-foreground mt-1">
                        📄 {resume.cmetadata.fileName}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
            {displayedResumes.length === 0 && !isDisplayLoading && (
              <li className="text-center text-muted-foreground py-8">
                {searchQuery.trim() ? 'No resumes found matching your search criteria.' : 'No resumes found.'}
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
};

export default Resumes;