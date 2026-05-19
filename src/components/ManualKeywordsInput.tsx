"use client";

import { useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ManualKeywordsInputProps {
  initialKeywords?: string[];
  onSave: (keywords: string[]) => Promise<void>;
  maxKeywords?: number;
}

export function ManualKeywordsInput({
  initialKeywords = [],
  onSave,
  maxKeywords = 5,
}: ManualKeywordsInputProps) {
  const [keywords, setKeywords] = useState<string[]>(initialKeywords);
  const [input, setInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleAddKeyword = () => {
    const trimmed = input.trim();
    if (!trimmed) {
      setError("Enter a keyword");
      return;
    }

    if (keywords.length >= maxKeywords) {
      setError(`Maximum ${maxKeywords} keywords allowed`);
      return;
    }

    if (keywords.some((k) => k.toLowerCase() === trimmed.toLowerCase())) {
      setError("Keyword already added");
      return;
    }

    setKeywords([...keywords, trimmed]);
    setInput("");
    setError(null);
    setSuccess(false);
  };

  const handleRemoveKeyword = (index: number) => {
    setKeywords(keywords.filter((_, i) => i !== index));
    setError(null);
  };

  const handleSave = async () => {
    if (keywords.length === 0) {
      setError("Add at least one keyword");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await onSave(keywords);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save keywords";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddKeyword();
    }
  };

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div>
        <h3 className="font-semibold">Target Keywords (Top 5)</h3>
        <p className="text-sm text-muted-foreground">
          Enter up to {maxKeywords} job titles, skills, or roles you are targeting to boost match accuracy
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Success Alert */}
      {success && (
        <Alert className="bg-green-50 border-green-200">
          <AlertDescription className="text-green-800">
            Keywords saved successfully!
          </AlertDescription>
        </Alert>
      )}

      {/* Keyword Input */}
      <div className="flex gap-2">
        <Input
          placeholder="e.g., React Developer, TypeScript, Full-stack"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={isSaving || keywords.length >= maxKeywords}
          className="flex-1"
        />
        <Button
          onClick={handleAddKeyword}
          disabled={isSaving || keywords.length >= maxKeywords || !input.trim()}
          size="sm"
          className="gap-1"
        >
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>

      {/* Keywords Display */}
      <div className="flex flex-wrap gap-2">
        {keywords.map((keyword, index) => (
          <Badge
            key={index}
            variant="secondary"
            className="gap-1 cursor-pointer hover:bg-secondary/80"
          >
            {keyword}
            <button
              onClick={() => handleRemoveKeyword(index)}
              disabled={isSaving}
              className="ml-1 rounded hover:bg-black/10"
              aria-label={`Remove ${keyword}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>

      {/* Counter */}
      <div className="text-xs text-muted-foreground">
        {keywords.length} / {maxKeywords} keywords added
      </div>

      {/* Save Button */}
      <Button
        onClick={handleSave}
        disabled={isSaving || keywords.length === 0}
        className="w-full"
      >
        {isSaving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          "Save Keywords"
        )}
      </Button>
    </div>
  );
}
