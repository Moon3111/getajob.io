# Deep LLM Verification Layer - Technical Documentation

## Overview

The deep verification layer is a second-pass LLM-driven analysis that enriches each job on the current paginated page with rich AI insights. After the fast vector similarity search retrieves the top 30 jobs, when a user views a specific page (10 jobs), those jobs are analyzed by NVIDIA NIM's Llama 3.1 70B model to provide nuanced relevance assessments.

---

## Architecture

### Two-Stage Matching Pipeline

```
Stage 1: FAST (Vector Database)
├─ User CV keywords (embedded)
├─ Manual 5 target keywords (embedded)
├─ Hybrid scoring with cosine similarity
└─ Returns TOP 30 results (3 pages × 10 jobs)

Stage 2: DEEP (LLM Verification) [NEW]
├─ Triggered when user views current page
├─ Analyzes ONLY the 10 visible jobs
├─ NVIDIA NIM evaluates job descriptions
├─ Returns detailed relevance rating + analysis
└─ Enriches job cards with AI insights
```

### Performance Characteristics

| Stage | Speed | Scope | Cost |
|-------|-------|-------|------|
| Vector Search | <500ms | 30 jobs | Low (DB query) |
| LLM Verification | 3-4s | 10 jobs/page | High (LLM API) |
| **Total** | **~4s** | **Current page** | **Optimized** |

**Key Optimization**: We only verify the 10 visible jobs, NOT all 30 candidates. This keeps API costs manageable while providing deep insights.

---

## Backend Implementation

### 1. LLM Verification Utility (`src/lib/nim-verification.ts`)

#### `performDeepVerification(jobs, profile, manualKeywords)`

**Signature**:
```typescript
export async function performDeepVerification(
  jobs: VerificationJob[],
  profile: ParsedResume,
  manualKeywords: string[]
): Promise<Map<string, AIAnalysis | null>>
```

**Input**:
- `jobs`: Array of 10 job objects with `job_id`, `title`, `company`, `description`
- `profile`: User's parsed resume (skills, experience, ideal role)
- `manualKeywords`: User's 5 manual target keywords

**Process**:
1. **Build Context** (Non-blocking):
   - Profile summary (skills, experience, role)
   - Manual keywords string
   - Truncated job descriptions (max 300 chars each to prevent token bloat)

2. **Construct Prompt**:
   ```
   System: "You are an expert resume analyst. Analyze each job against the profile.
            Return ONLY valid JSON array with exactly 10 objects."
   
   User: "CANDIDATE PROFILE: [...]
          TARGET KEYWORDS: [...]
          JOBS TO ANALYZE: [...]"
   ```

3. **Call NVIDIA NIM**:
   - Model: `meta/llama-3.1-70b-instruct`
   - Temperature: 0.3 (low for consistency)
   - Max tokens: 2048
   - **Timeout**: 8 seconds (graceful degradation on timeout)

4. **Parse Response** (Defensive):
   - Strips markdown code blocks
   - Validates JSON structure
   - Falls back to null if parse fails
   - Validates each field (rating, fit_percentage, keywords)

5. **Return Map**:
   - Key: Job ID
   - Value: `AIAnalysis` object or `null` (on error)

**Error Handling**:
- ✅ Missing API key → throws at startup
- ✅ API failure → logs error, returns null for all jobs
- ✅ Timeout → logs, gracefully degrades
- ✅ Invalid JSON → logs, uses null fallback
- ✅ Partial failures → returns partial results

---

### 2. API Route Update (`src/app/api/jobs/match/route.ts`)

**Changes**:
1. Import `performDeepVerification` and `ParsedResume`
2. After slicing paginated jobs, call verification
3. Enrich job objects with `ai_analysis` property
4. Return enhanced response

**Code Flow**:
```typescript
// Get paginated jobs from vector search
const pageResults = results.slice(offset, offset + limit);
const jobs = pageResults.map(row => ({
  // ... basic fields
  // AI analysis NOT set yet
}));

// NEW: Perform deep verification
const verificationJobs = jobs.map(j => ({
  job_id: j.id,
  title: j.title,
  company: j.company,
  description: j.description,
}));

const analysisMap = await performDeepVerification(
  verificationJobs,
  profile,      // ParsedResume
  manualKeywords // string[]
);

// Enrich jobs with AI analysis
jobs.forEach(job => {
  const analysis = analysisMap.get(job.id);
  if (analysis) {
    job.ai_analysis = analysis;
  }
});

return { jobs, pagination };
```

**Non-Blocking Failure**:
- If LLM verification fails, jobs still return with vector scores
- No `ai_analysis` field present if enrichment fails
- Frontend gracefully handles missing `ai_analysis`

---

## Data Types

### `AIAnalysis` (types.ts)
```typescript
interface AIAnalysis {
  relevance_rating: "EXCELLENT" | "GOOD" | "FAIR" | "MISMATCH";
  fit_percentage: number;           // 0-100
  analysis_summary: string;         // 1-2 sentences
  missing_keywords: string[];       // up to 5 keywords
}
```

### `MatchedJob` Update (types.ts)
```typescript
interface MatchedJob extends JobRecord {
  similarity: number;
  match_percent: number;
  ai_analysis?: AIAnalysis;  // NEW: Optional field
}
```

**Why Optional?**
- Allows graceful degradation if LLM verification fails
- Backwards compatible with paginated responses
- Frontend can display vector score even if LLM analysis missing

---

## Frontend Implementation

### 1. Updated JobCard Component

**New Sections**:

#### A. Enhanced Header
```
┌─────────────────────────────────────────┐
│ Senior React Developer   │ 85% Vector   │
│ Acme Corp                │ 92% AI Fit   │
│                          │ EXCELLENT ⭐  │
└─────────────────────────────────────────┘
```

- Shows both vector match % and AI fit %
- Displays relevance rating badge (color-coded)

#### B. AI Insight Box
```
┌─ AI Insight ──────────────────────────┐
│ Matches your React/TypeScript stack   │
│ perfectly and hits your target        │
│ keyword 'Remote'.                     │
└───────────────────────────────────────┘
```

- Colored background based on relevance rating
  - EXCELLENT: Emerald ✅
  - GOOD: Blue ℹ️
  - FAIR: Amber ⚠️
  - MISMATCH: Gray ❌

#### C. Skills Gap Section
```
┌─ Skills Gap: ─────────────────────────┐
│ Missing: GraphQL                      │
│ Missing: Kubernetes                   │
│ Missing: AWS                          │
└───────────────────────────────────────┘
```

- Shows critical keywords from user profile not mentioned in job
- Helps user identify gaps to learn or discuss

**Key Features**:
- ✅ Graceful rendering if `ai_analysis` is missing
- ✅ Color-coded relevance badges
- ✅ Readable 1-2 sentence insights
- ✅ Responsive on mobile (flex-wrap)
- ✅ Matches existing card design

---

## Response Schema

### Success Response (GET /api/jobs/match?page=1)
```json
{
  "jobs": [
    {
      "id": "uuid",
      "source": "indeed",
      "title": "Senior React Developer",
      "company": "Acme Corp",
      "url": "https://indeed.com/...",
      "description": "We seek a talented React developer...",
      "similarity": 0.85,
      "match_percent": 85,
      "ai_analysis": {
        "relevance_rating": "EXCELLENT",
        "fit_percentage": 92,
        "analysis_summary": "Matches your React/TypeScript stack perfectly and hits your target keyword 'Remote'.",
        "missing_keywords": ["GraphQL", "AWS"]
      }
    },
    {
      "id": "uuid",
      "source": "jobsdb",
      "title": "Full-Stack Engineer",
      "company": "TechStartup",
      "url": "https://...",
      "description": "...",
      "similarity": 0.72,
      "match_percent": 72,
      "ai_analysis": {
        "relevance_rating": "FAIR",
        "fit_percentage": 65,
        "analysis_summary": "Has some technical overlap but requires learning Python and lacks emphasis on remote work.",
        "missing_keywords": ["Python", "Remote"]
      }
    }
    // ... 8 more jobs
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "totalResults": 30,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### Partial Response (LLM verification fails)
```json
{
  "jobs": [
    {
      "id": "uuid",
      "source": "indeed",
      "title": "Senior React Developer",
      "company": "Acme Corp",
      "url": "https://...",
      "description": "...",
      "similarity": 0.85,
      "match_percent": 85
      // ai_analysis: NOT PRESENT
    }
    // ... rest of jobs without ai_analysis
  ],
  "pagination": { ... }
}
```

**Behavior**: 
- Returns 200 OK regardless of LLM success
- Vector scores always present
- AI analysis added only if verification succeeds
- Frontend renders either way

---

## Prompt Engineering

### System Prompt (in NIM call)
```
You are an expert resume and job matching analyst. 
Analyze each job deeply against the provided candidate profile.
Return ONLY a valid JSON array with exactly 10 objects matching this schema:
[
  {
    "job_id": "string",
    "relevance_rating": "EXCELLENT" | "GOOD" | "FAIR" | "MISMATCH",
    "fit_percentage": number (0-100),
    "analysis_summary": "1-2 sentence explanation of fit",
    "missing_keywords": ["array", "of", "missing", "keywords"]
  }
]
CRITICAL: Return ONLY the JSON array. No markdown, no explanation.
```

### User Prompt Structure
```
CANDIDATE PROFILE:
Role: Full-Stack Engineer
Years: 5+
Technical Skills: React, TypeScript, Node.js, PostgreSQL
Soft Skills: Leadership, Communication

TARGET KEYWORDS (Top 5 priorities):
React Developer, Remote, Fintech, TypeScript, Hong Kong

JOBS TO ANALYZE:
Job 1:
  ID: abc-123
  Title: Senior React Developer
  Company: TechCorp
  Description: [truncated to 300 chars]

Job 2:
  ...
```

**Design Principles**:
- ✅ Include context (profile + keywords) for each analysis
- ✅ Truncate job descriptions to prevent token bloat
- ✅ Force JSON output with "CRITICAL" instruction
- ✅ Low temperature (0.3) for consistency

---

## Timeout & Performance

### Timeout Strategy
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 8000);

try {
  const response = await fetch(..., { signal: controller.signal });
  // ...
} catch (err) {
  if (err instanceof Error && err.name === "AbortError") {
    console.error("Deep verification timeout exceeded");
  }
}
```

### Expected Latencies
- **NVIDIA NIM Response**: 2-4 seconds (batch of 10 jobs)
- **Network Round Trip**: ~500ms
- **Parse & Enrich**: ~100ms
- **Total**: ~3-4 seconds

### Per-Job Cost (Approximate)
- 1 API call for 10 jobs = ~$0.01-0.02 USD
- Vector search (30 jobs) = ~$0.001 USD
- **Total cost per page view**: <$0.03

---

## Testing Checklist

**Backend**:
- [ ] API returns 200 with paginated jobs
- [ ] `ai_analysis` present in response
- [ ] Relevance rating valid (one of 4 values)
- [ ] Fit percentage 0-100
- [ ] Analysis summary concise (1-2 sentences)
- [ ] Missing keywords array present
- [ ] Graceful degradation if LLM fails (no `ai_analysis`)
- [ ] Timeout handled (doesn't hang)
- [ ] Different pages have different analyses

**Frontend**:
- [ ] JobCard renders without `ai_analysis` (graceful)
- [ ] JobCard renders with `ai_analysis` (full display)
- [ ] Relevance badge colors correct
  - [ ] EXCELLENT = Emerald
  - [ ] GOOD = Blue
  - [ ] FAIR = Amber
  - [ ] MISMATCH = Gray
- [ ] Analysis summary readable on mobile
- [ ] Missing keywords displayed correctly
- [ ] Skills gap section only shows if keywords present
- [ ] Both vector % and AI % shown
- [ ] Save/dismiss/apply buttons still work

**Integration**:
- [ ] Page 1 has AI analysis
- [ ] Page 2 has different AI analysis
- [ ] Page 3 has different AI analysis
- [ ] Manual keywords influence AI analysis
- [ ] Profile skills reflected in analysis
- [ ] Timeout doesn't break UI

---

## Troubleshooting

### Issue: `ai_analysis` not present in response
**Causes**:
- NVIDIA API key missing/expired
- LLM verification timeout
- JSON parse failure
- NIM API rate limit exceeded

**Solution**:
- Check `NVIDIA_API_KEY` in environment
- Increase timeout to 10s (in nim-verification.ts)
- Review console logs for parse errors
- Verify NVIDIA API quota

### Issue: Incorrect relevance ratings
**Causes**:
- LLM returning unexpected values
- Case sensitivity in validation
- Invalid JSON response

**Solution**:
- Lower temperature from 0.3 to 0.1 for stricter output
- Check validation logic in `validateRating()`
- Review NIM prompt for clarity

### Issue: High latency (>5 seconds)
**Causes**:
- NVIDIA API overload
- Network congestion
- Large job descriptions (token bloat)

**Solution**:
- Truncate descriptions more aggressively (200 chars)
- Implement client-side timeout UI feedback
- Cache LLM results (future enhancement)

### Issue: Missing keywords are too many/vague
**Causes**:
- Prompt not specifying target keywords clearly
- Job descriptions missing standard terminology
- Profile skills not well-represented in job post

**Solution**:
- Refine prompt to be more explicit
- Use canonical skill names (not abbreviations)
- Test with different LLM models

---

## Files Modified/Created

| File | Change | Type |
|------|--------|------|
| `src/lib/types.ts` | Added `AIAnalysis`, updated `MatchedJob` | Type update |
| `src/lib/nim-verification.ts` | New verification utility | New file |
| `src/app/api/jobs/match/route.ts` | Added deep verification call | Backend update |
| `src/components/JobCard.tsx` | Added AI analysis display | UI update |
| `docs/DEEP_VERIFICATION.md` | This documentation | Documentation |

---

## Future Enhancements

1. **Caching**: Cache LLM analyses per job_id to avoid re-analyzing
2. **Async Enrichment**: Return jobs immediately, enrich in background
3. **Multi-Model**: Allow users to choose between Llama 3.1 70B and other models
4. **Analytics**: Track which relevance ratings correlate with user saves
5. **Fine-tuning**: Fine-tune prompt based on click-through rates
6. **Cost Optimization**: Batch multiple pages together to reduce API calls

---

## Security & Privacy

- ✅ NVIDIA API key never exposed to client
- ✅ User profile data only sent to NVIDIA (encrypted via HTTPS)
- ✅ Job descriptions truncated to prevent data leakage
- ✅ LLM responses logged locally only (no storage)
- ✅ All processing server-side (no client-side LLM calls)

---

## References

- NVIDIA NIM API: https://build.nvidia.com/meta/llama-3_1-70b-instruct
- Llama 3.1 70B: https://www.llama.com/
- TypeScript Strict Mode: https://www.typescriptlang.org/tsconfig#strict
- Shadcn UI Badges: https://ui.shadcn.com/docs/components/badge
