"use client";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputToolbar,
  PromptInputTools,
  PromptInputModelSelect,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
} from "@/components/ai-elements/prompt-input";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { ChatHeader } from "@/components/chat-header";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/source";
import { Actions, Action } from "@/components/ai-elements/actions";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { CandidateCard } from "@/components/ui/candidate-card";
import { useState, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { Response } from "@/components/ai-elements/response";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { resumeKeys } from "@/lib/hooks/useResumes";
import {
  RefreshCcwIcon,
  CopyIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
  ShareIcon,
} from "lucide-react";

// Define types for tool parts
interface ToolPartOutput {
  candidates?: Array<{
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
  }>;
  totalResults?: number;
  averageConfidence?: number;
  query?: string;
}

interface ToolPart {
  type: string;
  output?: ToolPartOutput;
  input?: unknown;
  state?: string;
  errorText?: string;
}

// Helper function to transform source href from hash format to PDF path
function transformSourceHref(href: string): string {
  // Transform "#resume-<id>" to "/resumes/<id>.pdf"
  if (href.startsWith("#resume-")) {
    const resumeId = href.replace("#resume-", "");
    return `/resumes/${resumeId}.pdf`;
  }
  return href;
}

const models = [
  { id: "gpt-4o", name: "GPT-4o" },
  { id: "claude-opus-4-20250514", name: "Claude 4 Opus" },
];

// CV/Resume specific suggestions
const suggestions = [
  "Project managers",
  "React developers",
  "5+ years experience",
  "Leadership roles",
  "Data scientists",
  "Python developers",
  "Marketing pros",
  "MBA graduates",
];

const Chat = () => {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<FileList | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { messages, sendMessage, status, regenerate } = useChat({
    messages: [
      {
        id: "1",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "Hello, I am your assistant to help you find resumes matching your criteria.",
          },
        ],
      },
    ],
  });

  const [model, setModel] = useState<string>(models[0].id);

  const handleUpload = async (file: File) => {
    try {
      // Create form data for file upload
      const formData = new FormData();
      formData.append("file", file);
      
      // Send to our upload API route
      const response = await fetch("/api/resume/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || "Upload failed");
      }

      const result = await response.json();

      // Invalidate and refetch resumes
      queryClient.invalidateQueries({ queryKey: resumeKeys.all });
      
      toast.success("Resume uploaded successfully!", {
        description: `${file.name} has been processed and added to the database.`,
      });
      
      return result;
    } catch (error) {
      console.error("Error uploading resume:", error);
      throw error; // Re-throw to let the ChatHeader handle the error state
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && (!files || files.length === 0)) return;

    try {
      sendMessage({
        text: input,
        files: files,
      });

      setFiles(undefined);
      setInput("");

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Error processing files:", error);
      toast.error("Error processing files. Please try again.");
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage({ text: suggestion });
  };

  return (
    <div className="relative size-full rounded-lg border h-full">
      <div className="flex flex-col h-full">
        <ChatHeader onUpload={handleUpload} />
        <Conversation>
          <ConversationContent>
            {messages.map((message, messageIndex) => (
              <div key={message.id}>
                {message.role === "assistant" &&
                  (() => {
                    // Calculate sources from tool results
                    const toolParts = message.parts.filter(
                      (part) =>
                        "type" in part &&
                        typeof part.type === "string" &&
                        part.type.startsWith("tool-searchResumes")
                    );

                    const sources = toolParts.flatMap((part, i) => {
                      const toolPart = part as ToolPart;
                      // Handle new response format
                      if (
                        toolPart.output &&
                        toolPart.output.candidates &&
                        Array.isArray(toolPart.output.candidates)
                      ) {
                        return toolPart.output.candidates.map(
                          (candidate, idx: number) => ({
                            key: `${message.id}-${i}-${idx}`,
                            href: transformSourceHref(`#resume-${candidate.id}`),
                            title: `${candidate.name} - ${candidate.title}`,
                          })
                        );
                      }
                      return [];
                    });

                    // Only render Sources if there are actual sources
                    if (sources.length === 0) return null;

                    return (
                      <Sources>
                        <SourcesTrigger count={sources.length} />
                        <SourcesContent>
                          {sources.map((source) => (
                            <Source
                              key={source.key}
                              href={source.href}
                              title={source.title}
                            />
                          ))}
                        </SourcesContent>
                      </Sources>
                    );
                  })()}
                <Message from={message.role} key={message.id}>
                  <MessageContent>
                    {message.parts.map((part, i) => {
                      const isLastMessage =
                        messageIndex === messages.length - 1;

                      switch (part.type as string) {
                        case "text":
                          return (
                            <div key={`${message.id}-${i}`}>
                              <Response>{part.text}</Response>
                              {message.role === "assistant" &&
                                isLastMessage && (
                                  <Actions className="mt-2">
                                    <Action
                                      onClick={() => regenerate()}
                                      label="Retry"
                                      tooltip="Regenerate response"
                                    >
                                      <RefreshCcwIcon className="size-3" />
                                    </Action>
                                    <Action
                                      onClick={() => {
                                        navigator.clipboard.writeText(
                                          part.text
                                        );
                                        toast.success("Copied to clipboard");
                                      }}
                                      label="Copy"
                                      tooltip="Copy message"
                                    >
                                      <CopyIcon className="size-3" />
                                    </Action>
                                    <Action
                                      onClick={() => {
                                        toast.success("Liked!");
                                      }}
                                      label="Like"
                                      tooltip="Like this response"
                                    >
                                      <ThumbsUpIcon className="size-3" />
                                    </Action>
                                    <Action
                                      onClick={() => {
                                        toast.info("Disliked");
                                      }}
                                      label="Dislike"
                                      tooltip="Dislike this response"
                                    >
                                      <ThumbsDownIcon className="size-3" />
                                    </Action>
                                    <Action
                                      onClick={() => {
                                        if (navigator.share) {
                                          navigator.share({
                                            title: "CV Explorer Response",
                                            text: part.text,
                                          });
                                        } else {
                                          navigator.clipboard.writeText(
                                            part.text
                                          );
                                          toast.success(
                                            "Copied to clipboard (sharing not supported)"
                                          );
                                        }
                                      }}
                                      label="Share"
                                      tooltip="Share this response"
                                    >
                                      <ShareIcon className="size-3" />
                                    </Action>
                                  </Actions>
                                )}
                            </div>
                          );
                        case "reasoning":
                          return (
                            <Reasoning
                              key={`${message.id}-${i}`}
                              className="w-full"
                              isStreaming={status === 'streaming' && isLastMessage}
                            >
                              <ReasoningTrigger />
                              <ReasoningContent>{part.text}</ReasoningContent>
                            </Reasoning>
                          );
                        default:
                          // Handle tool calls
                          if ((part as ToolPart).type?.startsWith("tool-")) {
                            const toolPart = part as ToolPart; // Type assertion for tool parts
                            return (
                              <Tool
                                key={`${message.id}-${i}`}
                                defaultOpen={false}
                              >
                                <ToolHeader
                                  type={toolPart.type as `tool-${string}`}
                                  state={
                                    toolPart.state as
                                      | "input-streaming"
                                      | "input-available"
                                      | "output-available"
                                      | "output-error"
                                  }
                                />
                                <ToolContent>
                                  <ToolInput input={toolPart.input} />
                                  <ToolOutput
                                    output={
                                      toolPart.output ? (
                                        <div>
                                          {(() => {
                                            // Handle new response format with structured data
                                            if (
                                              toolPart.output.candidates &&
                                              Array.isArray(
                                                toolPart.output.candidates
                                              )
                                            ) {
                                              const {
                                                totalResults,
                                                averageConfidence,
                                                query,
                                                candidates,
                                              } = toolPart.output;

                                              return (
                                                <div className="space-y-4">
                                                  {/* Summary Header */}
                                                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                                    <h3 className="font-semibold text-blue-900 mb-2">
                                                      🔍 Search Results for
                                                      &quot;{query}&quot;
                                                    </h3>
                                                    <div className="flex gap-4 text-sm">
                                                      <span className="text-blue-700">
                                                        <strong>
                                                          {totalResults}
                                                        </strong>{" "}
                                                        {totalResults === 1
                                                          ? "candidate"
                                                          : "candidates"}{" "}
                                                        found
                                                      </span>
                                                      <span className="text-blue-700">
                                                        <strong>
                                                          {averageConfidence}%
                                                        </strong>{" "}
                                                        average confidence
                                                      </span>
                                                    </div>
                                                  </div>

                                                  {/* Candidate Cards */}
                                                  <div className="space-y-3">
                                                    {candidates.map(
                                                      (
                                                        candidate,
                                                        index: number
                                                      ) => (
                                                        <CandidateCard
                                                          key={
                                                            candidate.id ||
                                                            index
                                                          }
                                                          candidate={candidate}
                                                          className="w-full"
                                                        />
                                                      )
                                                    )}
                                                  </div>
                                                </div>
                                              );
                                            }

                                            // Fallback for old format
                                            if (
                                              Array.isArray(toolPart.output)
                                            ) {
                                              return (
                                                <Response>
                                                  {(
                                                    toolPart.output as Array<{
                                                      name?: string;
                                                      title?: string;
                                                      summary?: string;
                                                      id?: string;
                                                    }>
                                                  )
                                                    .map(
                                                      (resume, index: number) =>
                                                        `**${index + 1}. ${
                                                          resume.name ||
                                                          "Unknown"
                                                        }**\n` +
                                                        `*${
                                                          resume.title ||
                                                          "No title"
                                                        }*\n\n` +
                                                        `${
                                                          resume.summary ||
                                                          "No summary"
                                                        }\n\n` +
                                                        `**Key Information:**\n` +
                                                        `• Name: ${
                                                          resume.name ||
                                                          "Not specified"
                                                        }\n` +
                                                        `• Position: ${
                                                          resume.title ||
                                                          "Not specified"
                                                        }\n` +
                                                        `• Resume ID: ${resume.id}\n\n` +
                                                        `---\n\n`
                                                    )
                                                    .join("")}
                                                </Response>
                                              );
                                            }

                                            return (
                                              <Response>
                                                No results found
                                              </Response>
                                            );
                                          })()}
                                        </div>
                                      ) : undefined
                                    }
                                    errorText={toolPart.errorText}
                                  />
                                </ToolContent>
                              </Tool>
                            );
                          }
                          return null;
                      }
                    })}
                  </MessageContent>
                  <MessageAvatar src={`/${message.role}.png`} />
                </Message>
              </div>
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {/* Suggestions for quick actions */}
        {messages.length <= 1 && (
          <div className="px-4 py-2 max-w-full">
            <p className="text-sm text-muted-foreground mb-2">Try asking:</p>
            <Suggestions className="max-w-full overflow-x-auto">
              {suggestions.map((suggestion) => (
                <Suggestion
                  key={suggestion}
                  onClick={handleSuggestionClick}
                  suggestion={`Find ${suggestion}`}
                  className="flex-shrink-0"
                />
              ))}
            </Suggestions>
          </div>
        )}

        <PromptInput
          onSubmit={handleSubmit}
          className="mt-4 w-full max-w-2xl mx-auto relative"
        >
          <PromptInputTextarea
            value={input}
            placeholder={
              files && files.length > 0
                ? `Say something about the ${files.length} selected file${
                    files.length > 1 ? "s" : ""
                  }...`
                : "Say something..."
            }
            onChange={(e) => setInput(e.currentTarget.value)}
            className="pr-12"
          />
          <PromptInputSubmit
            status={status === "streaming" ? "streaming" : "ready"}
            disabled={!input.trim()}
            className="absolute bottom-1 right-1"
          />
          <PromptInputToolbar>
            <PromptInputTools>
              <PromptInputModelSelect
                onValueChange={(value) => {
                  setModel(value);
                }}
                value={model}
              >
                <PromptInputModelSelectTrigger>
                  <PromptInputModelSelectValue />
                </PromptInputModelSelectTrigger>
                <PromptInputModelSelectContent>
                  {models.map((model) => (
                    <PromptInputModelSelectItem key={model.id} value={model.id}>
                      {model.name}
                    </PromptInputModelSelectItem>
                  ))}
                </PromptInputModelSelectContent>
              </PromptInputModelSelect>
            </PromptInputTools>
          </PromptInputToolbar>
        </PromptInput>
      </div>
    </div>
  );
};

export default Chat;
