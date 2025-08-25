import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { ChevronDown, CheckCircle, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

interface CandidateCardProps {
  candidate: {
    id: string;
    name: string;
    title: string;
    summary: string;
    confidence: number;
    matchExplanation?: string;
    matchDetails?: {
      positionMatch?: number;
      seniorityMatch?: number;
      skillsMatch?: number;
      experienceMatch?: number;
      educationMatch?: number;
      locationMatch?: number;
      softSkillsMatch?: number;
      keyStrengths?: string[];
      potentialConcerns?: string[];
    };
  };
  className?: string;
}

export function CandidateCard({ candidate, className }: CandidateCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-600 bg-green-50 border-green-200';
    if (confidence >= 60) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    if (confidence >= 40) return 'text-orange-600 bg-orange-50 border-orange-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const getMatchLabel = (confidence: number) => {
    if (confidence >= 80) return 'Excellent Match';
    if (confidence >= 60) return 'Good Match';
    if (confidence >= 40) return 'Partial Match';
    return 'Low Match';
  };

  const renderMatchBar = (label: string, value: number | undefined) => {
    if (value === undefined) return null;
    
    const getWidthClass = (percentage: number) => {
      // Convert percentage to Tailwind width class
      if (percentage >= 95) return 'w-full';
      if (percentage >= 90) return 'w-11/12';
      if (percentage >= 80) return 'w-4/5';
      if (percentage >= 75) return 'w-3/4';
      if (percentage >= 70) return 'w-7/12';
      if (percentage >= 60) return 'w-3/5';
      if (percentage >= 50) return 'w-1/2';
      if (percentage >= 40) return 'w-2/5';
      if (percentage >= 30) return 'w-1/3';
      if (percentage >= 25) return 'w-1/4';
      if (percentage >= 20) return 'w-1/5';
      if (percentage >= 10) return 'w-1/12';
      return 'w-1';
    };
    
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="w-20 text-muted-foreground">{label}:</span>
        <div className="flex-1 bg-gray-200 rounded-full h-2">
          <div
            className={cn(
              "h-2 rounded-full transition-all",
              getWidthClass(value),
              value >= 80 ? "bg-green-500" :
              value >= 60 ? "bg-yellow-500" :
              value >= 40 ? "bg-orange-500" : "bg-red-500"
            )}
          />
        </div>
        <span className="w-8 text-right font-medium">{value}%</span>
      </div>
    );
  };

  return (
    <Card className={cn("p-4 hover:shadow-md transition-shadow", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-lg truncate">{candidate.name}</h3>
            <Badge variant="outline" className="text-xs">
              {candidate.id.substring(0, 8)}
            </Badge>
          </div>
          
          <p className="text-sm text-muted-foreground font-medium mb-2">
            {candidate.title}
          </p>
          
          <p className="text-sm text-muted-foreground overflow-hidden mb-2">
            <span className="line-clamp-2">{candidate.summary}</span>
          </p>

          {/* Match Explanation */}
          {candidate.matchExplanation && (
            <div className="text-sm text-blue-700 bg-blue-50 p-2 rounded mb-2">
              <strong>Why this matches:</strong> {candidate.matchExplanation}
            </div>
          )}
        </div>
        
        <div className="flex flex-col items-end gap-2">
          <div className={cn(
            "text-center p-3 rounded-lg border-2 min-w-[80px] flex-shrink-0",
            getConfidenceColor(candidate.confidence)
          )}>
            <div className="text-2xl font-bold">{candidate.confidence}%</div>
            <div className="text-xs font-medium mt-1">
              {getMatchLabel(candidate.confidence)}
            </div>
          </div>

          {/* Details Toggle */}
          {candidate.matchDetails && (
            <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <span>Details</span>
                  <ChevronDown className={cn(
                    "h-3 w-3 transition-transform",
                    isExpanded && "rotate-180"
                  )} />
                </button>
              </CollapsibleTrigger>
            </Collapsible>
          )}
        </div>
      </div>

      {/* Detailed Match Analysis */}
      {candidate.matchDetails && (
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleContent className="mt-4 pt-4 border-t border-border/40">
            <div className="space-y-3">
              {/* Match Breakdown */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-foreground">Match Breakdown</h4>
                {renderMatchBar("Position", candidate.matchDetails.positionMatch)}
                {renderMatchBar("Seniority", candidate.matchDetails.seniorityMatch)}
                {renderMatchBar("Skills", candidate.matchDetails.skillsMatch)}
                {renderMatchBar("Experience", candidate.matchDetails.experienceMatch)}
                {renderMatchBar("Education", candidate.matchDetails.educationMatch)}
                {renderMatchBar("Location", candidate.matchDetails.locationMatch)}
                {renderMatchBar("Soft Skills", candidate.matchDetails.softSkillsMatch)}
              </div>

              {/* Key Strengths */}
              {candidate.matchDetails.keyStrengths && candidate.matchDetails.keyStrengths.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-green-700 flex items-center gap-1 mb-2">
                    <CheckCircle className="h-3 w-3" />
                    Key Strengths
                  </h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {candidate.matchDetails.keyStrengths.map((strength, index) => (
                      <li key={index} className="flex items-start gap-1">
                        <span className="text-green-500 mt-0.5">•</span>
                        <span>{strength}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Potential Concerns */}
              {candidate.matchDetails.potentialConcerns && candidate.matchDetails.potentialConcerns.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-orange-700 flex items-center gap-1 mb-2">
                    <AlertTriangle className="h-3 w-3" />
                    Potential Concerns
                  </h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {candidate.matchDetails.potentialConcerns.map((concern, index) => (
                      <li key={index} className="flex items-start gap-1">
                        <span className="text-orange-500 mt-0.5">•</span>
                        <span>{concern}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </Card>
  );
}
