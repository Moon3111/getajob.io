# Hybrid Job Matching with Dual-Signal Vector Search & Pagination

## Overview

This implementation adds an advanced hybrid matching system that combines two distinct signals for intelligent job recommendations:

- **Signal A (CV Keywords)**: AI-analyzed keywords extracted from the user's uploaded resume via NVIDIA NIM
- **Signal B (Manual Keywords)**: User-specified top 5 target keywords/skills representing their immediate career intent

The system returns paginated results (10 jobs per page, max 30 results = 3 pages) with smooth, responsive pagination controls.

---

## Architecture

### 1. Database Schema Updates

**Migration**: `supabase/migrations/006_hybrid_matching_pagination.sql`

Added to `user_profiles` table:
- `manual_top_keywords TEXT[]` - Array of up to 5 user-specified target keywords

### 2. PostgreSQL RPC Functions

Two functions for flexibility:

#### `match_jobs_hybrid()`
- **Parameters**: 
  - `cv_keywords_embeddings`: Pre-computed embedding vectors from CV keywords
  - `manual_keywords_embeddings`: Pre-computed embedding vectors from manual keywords  
  - `match_threshold`, `limit_count`, `offset_count`, `p_user_id`
- **Scoring Logic**:
  - CV score: Direct cosine similarity match
  - Manual score: Cosine similarity × **1.2x weight multiplier** (prioritizes user intent)
  - Combined: `(cv_score + manual_score_weighted) / 2.2` (normalized average)
- **Returns**: Top N jobs with `combined_score` field

#### `match_jobs_hybrid_single()`
- Simpler version accepting pre-computed single embedding
- For use cases needing single query vector

**Key Features**:
- ✅ HNSW index utilization for vector searches (~O(log N) complexity)
- ✅ Dismissed job filtering (won't recommend already-swiped jobs)
- ✅ Database-level pagination (`LIMIT`/`OFFSET`)
- ✅ Cosine distance metric (`<=>` operator)

---

## Backend Implementation

### API Route: `GET /api/jobs/match`

**Location**: `src/app/api/jobs/match/route.ts`

#### Request Parameters
```typescript
GET /api/jobs/match?page=1&limit=10
```

- `page` (default: 1): Page number (1-indexed)
- `limit` (default: 10): Results per page (capped at 10)
- Max total results: 30 (3 pages)

#### Response Format
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
    }
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

#### Logic Flow
1. **Authenticate** user via Supabase Auth
2. **Load Profile**:
   - Fetch `technical_skills` (from CV analysis)
   - Fetch `manual_top_keywords` (user input)
3. **Embed Keywords**:
   - Call NVIDIA NIM embedding API for both keyword sets
   - Join embeddings into single vectors
4. **Query Database**:
   - Call RPC `match_jobs_hybrid()` with embeddings
   - Enforce pagination at DB level
5. **Transform & Return**:
   - Convert hybrid scores to `match_percent` (0-100)
   - Include pagination metadata

#### Error Handling
- **401 Unauthorized**: No authenticated user
- **400 Bad Request**: No profile or missing keywords
- **502 Bad Gateway**: NVIDIA API failures (with detailed message)
- **500 Internal Server Error**: RPC or Supabase failures

---

## Frontend Implementation

### New Components

#### 1. `ManualKeywordsInput.tsx`
User interface for entering up to 5 target keywords.

**Features**:
- ✅ Input validation (no duplicates, max 5 keywords)
- ✅ Badge-based UI with inline remove buttons
- ✅ Error/success messaging
- ✅ Disabled state during save

**Usage**:
```tsx
<ManualKeywordsInput
  initialKeywords={["React", "TypeScript"]}
  onSave={async (keywords) => {
    await saveManualKeywords(keywords);
  }}
  maxKeywords={5}
/>
```

#### 2. `PaginatedJobFeed.tsx`
Main job feed component with automatic pagination handling.

**Features**:
- ✅ Automatic page loading on pagination
- ✅ Loading skeleton state (10 placeholders)
- ✅ Error boundaries with retry button
- ✅ Auto-scroll to top on page change
- ✅ Result count display
- ✅ Empty state messaging

**State Management**:
- `currentPage`: Active page (1-indexed)
- `totalPages`: Maximum pages available
- `isLoading`: Fetch in progress
- `error`: Error message if fetch fails

#### 3. `JobPagination.tsx`
Pagination controls (Previous, Page 1-3, Next).

**Features**:
- ✅ Disabled states (at boundaries, during loading)
- ✅ Responsive gap layout
- ✅ Chevron icons for clarity
- ✅ Current page highlighting

#### 4. `JobListSkeleton.tsx`
Loading placeholder UI matching JobCard dimensions.

### Server Actions

#### `getHybridMatchedJobs(page, limit)`
Calls `/api/jobs/match` endpoint with error handling.

#### `saveManualKeywords(keywords)`
Persists keywords to `user_profiles.manual_top_keywords`.

### Dashboard Integration (`DashboardClient.tsx`)

**Changes**:
- Imported new components and server actions
- Added `ManualKeywordsInput` widget on "Matches" tab
- Replaced `matches` tab content with `PaginatedJobFeed`
- Preserved existing "Saved" and "Applied" tab functionality

**User Flow**:
1. User uploads resume → AI extracts CV keywords (existing flow)
2. User navigates to Dashboard → Matches tab
3. **NEW**: User inputs 5 manual target keywords in input box
4. **NEW**: Keywords get saved to database
5. **NEW**: Pagination fetches jobs using hybrid scoring
6. User browses 10 jobs per page with pagination controls
7. User can still save/dismiss/apply jobs as before

---

## Data Types

### `PaginationMeta` (types.ts)
```typescript
interface PaginationMeta {
  currentPage: number;
  totalPages: number;
  totalResults: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}
```

### `PaginatedJobsResponse` (types.ts)
```typescript
interface PaginatedJobsResponse {
  jobs: MatchedJob[];
  pagination: PaginationMeta;
}
```

---

## Deployment Checklist

### Before Deploying:

1. **Run Migration**:
   ```sql
   -- Execute on production Supabase:
   supabase/migrations/006_hybrid_matching_pagination.sql
   ```

2. **Environment Variables** (ensure in `.env.production`):
   - `NVIDIA_API_KEY` ✓ (already configured)
   - `NEXT_PUBLIC_APP_URL` ✓ (set correctly)

3. **Test Locally**:
   ```bash
   npm run dev
   # Test: http://localhost:3000/dashboard
   # Upload resume → Enter keywords → Check pagination
   ```

4. **Verify Build**:
   ```bash
   npm run build
   npm test  # If tests exist
   ```

5. **Production Testing**:
   - Test with real Supabase data
   - Verify pagination at boundaries (page 1, 3, edge cases)
   - Monitor NVIDIA API quota usage

---

## Performance Considerations

### Vector Search Optimization
- **HNSW Index**: O(log N) complexity vs. O(N) for linear scans
- **Batch Embedding**: Both keyword sets embedded in parallel (not sequential)
- **DB-Level Pagination**: `LIMIT`/`OFFSET` at query execution, not client-side filtering

### Caching Strategy
- No caching layer added (can add Redis later if needed)
- Each page load hits fresh vector similarity scores
- Dismissed jobs permanently filtered (won't resurface)

### Scaling Notes
- Hard cap at 30 results prevents expensive deep pagination
- Single RPC call per page (not per job)
- Embedding API is rate-limited; monitor NVIDIA quota

---

## Example Usage

### Step 1: Upload Resume
```typescript
// User uploads PDF → AI extracts keywords (existing flow)
// Database stores: user_profiles.technical_skills = ["React", "TypeScript", ...]
```

### Step 2: Enter Manual Keywords
```typescript
// User inputs: ["Full-stack Developer", "Hong Kong", "Fintech"]
await saveManualKeywords(["Full-stack Developer", "Hong Kong", "Fintech"]);
// Saved to: user_profiles.manual_top_keywords = [...]
```

### Step 3: Fetch Page 1
```typescript
const { data } = await getHybridMatchedJobs(1, 10);
// Returns 10 jobs scored by hybrid algorithm
// pagination.totalPages = 3 (30 results max)
```

### Step 4: Pagination
```typescript
// User clicks "Next" → Fetch page 2
const { data } = await getHybridMatchedJobs(2, 10);
```

---

## Future Enhancements

1. **Keyword Suggestions**: Auto-populate manual keywords from CV analysis
2. **Saved Preferences**: Persist pagination state (return to last viewed page)
3. **Search Filters**: By company, salary range, remote/on-site
4. **Sorting Options**: By recency, company size, match score
5. **ML Ranking**: Learn from user save/dismiss history for improved scoring
6. **Analytics**: Track which keywords generate most saves

---

## Troubleshooting

### Issue: "Failed to embed keywords" (502 error)
- **Cause**: NVIDIA API key missing or expired
- **Fix**: Verify `NVIDIA_API_KEY` in `.env.local` or `.env.production`

### Issue: No pagination controls shown
- **Cause**: `totalPages < 2`
- **Fix**: Seed more jobs into database (`/api/ingest-jobs`)

### Issue: Duplicate keywords not prevented
- **Cause**: Manual keywords not properly trimmed/deduplicated
- **Fix**: Check `ManualKeywordsInput` component logic (case-insensitive compare)

### Issue: Slow pagination transitions
- **Cause**: Large HNSW index or network latency
- **Fix**: Monitor NVIDIA API response times; consider caching frequent queries

---

## Files Summary

| File | Purpose |
|------|---------|
| `supabase/migrations/006_hybrid_matching_pagination.sql` | RPC functions & schema |
| `src/app/api/jobs/match/route.ts` | Paginated matching endpoint |
| `src/components/ManualKeywordsInput.tsx` | Keyword input UI |
| `src/components/PaginatedJobFeed.tsx` | Paginated feed component |
| `src/components/JobPagination.tsx` | Pagination controls |
| `src/components/JobListSkeleton.tsx` | Loading UI |
| `src/components/ui/skeleton.tsx` | Skeleton component (new) |
| `src/components/ui/alert.tsx` | Alert component (new) |
| `src/app/actions/hybrid-match-jobs.ts` | Server action: fetch jobs |
| `src/app/actions/save-manual-keywords.ts` | Server action: save keywords |
| `src/lib/types.ts` | New types: `PaginationMeta`, `PaginatedJobsResponse` |
| `src/components/DashboardClient.tsx` | Integrated new components |

---

## Testing Checklist

- [ ] Resume upload works (existing feature)
- [ ] Manual keywords input accepts 5 keywords
- [ ] Keywords cannot be duplicated
- [ ] Keywords save to database
- [ ] Page 1 loads with 10 jobs
- [ ] Pagination metadata correct (totalPages, currentPage)
- [ ] Page 2/3 load with different jobs
- [ ] Dismissed jobs don't reappear on pagination
- [ ] Scrolls to top on page change
- [ ] Loading skeleton shows during fetch
- [ ] Error message shows if API fails + Retry button works
- [ ] Empty state message if no jobs match
- [ ] Previous/Next buttons disabled at boundaries
- [ ] Works on mobile (responsive)

