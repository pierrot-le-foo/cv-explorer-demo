"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText } from "lucide-react";
import { useResumes } from "@/lib/hooks/useResumes";
import { toast } from "sonner";

interface ChatHeaderProps {
  onUpload?: (file: File) => void;
}

export function ChatHeader({ onUpload }: ChatHeaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const { data: resumes, isLoading } = useResumes();

  const uploadFile = async (file: File) => {
    // Validate file type
    if (file.type !== "application/pdf") {
      toast.error("Invalid file type. Please upload a PDF file.", {
        description: "Only PDF files are supported for resume uploads.",
      });
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB in bytes
    if (file.size > maxSize) {
      toast.error("File too large", {
        description: "Please upload a PDF file smaller than 10MB.",
      });
      return;
    }

    setIsUploading(true);
    
    // Show loading toast
    const loadingToast = toast.loading("Uploading resume...", {
      description: `Processing ${file.name}`,
    });

    try {
      if (onUpload) {
        await onUpload(file);
      }
      
      // Dismiss loading toast
      toast.dismiss(loadingToast);
    } catch (error) {
      console.error("Error uploading file:", error);
      
      // Dismiss loading toast
      toast.dismiss(loadingToast);
      
      // Show error with "Try again" button
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      toast.error("Upload failed", {
        description: `Failed to upload ${file.name}: ${errorMessage}`,
        action: {
          label: "Try again",
          onClick: () => uploadFile(file), // Retry with the same file
        },
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await uploadFile(file);
    
    // Reset the input after upload attempt
    event.target.value = "";
  };

  const resumeCount = resumes?.length || 0;

  return (
    <div className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex flex-col gap-4 p-6">
        {/* Title and Description */}
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Talent Matcher
          </h1>
          <p className="text-sm text-muted-foreground">
            Find CVs that match your company needs
          </p>
        </div>

        {/* Stats and Upload Section */}
        <div className="flex items-center justify-between">
          {/* Resume Counter */}
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <Badge variant="secondary" className="font-normal">
              {isLoading ? (
                "Loading..."
              ) : (
                `${resumeCount} resume${resumeCount !== 1 ? 's' : ''} in database`
              )}
            </Badge>
          </div>

          {/* Upload Button */}
          <div className="relative">
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isUploading}
              title="Upload PDF Resume"
              aria-label="Upload PDF Resume"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={isUploading}
              className="flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              {isUploading ? "Uploading..." : "Upload Resume"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
