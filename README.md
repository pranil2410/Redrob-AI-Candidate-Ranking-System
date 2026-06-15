# Redrob AI Candidate Ranking System

A complete, production-ready AI Candidate Ranking System built for the Redrob Data & AI Challenge.

## Project Structure

```
redrob-ai-ranking/
│
├── data/
│   └── (place candidates.jsonl here)
│
├── src/
│   ├── parser.py            # JSON/JSONL candidates parsing & JD loading
│   ├── scoring.py           # Multi-category normalized base scoring
│   ├── ranker.py            # Two-pass ranking & SentenceTransformers matching
│   ├── honeypot_detector.py # Suspicious profile & honeypot audit module
│   └── export.py            # Unique reasoning generation & CSV export
│
├── requirements.txt         # Project dependencies
├── README.md                # System documentation
└── main.py                  # CLI orchestrator
```

## Features

1. **Two-Pass Ranking Engine**:
   - **Pass 1**: Performs fast rule-based scoring (95% weight) and honeypot detection over the 100,000 candidate profiles.
   - **Filter**: Down-selects to the top 1,000 candidates.
   - **Pass 2**: Computes dense semantic similarities on CPU for the top 1,000 candidates using `sentence-transformers` (`all-MiniLM-L6-v2`), completing in **under 15 seconds** dynamically.

2. **Honeypot Detection Module**:
   - Audits impossible timelines (claimed months > calendar months elapsed, or overlapping jobs).
   - Flags unrealistic promotions (intern/junior to Lead/VP in under 6 months).
   - Catches contradictory skill claims (expert skills with 0 months experience, or non-technical title with expert AI/ML technical skills).
   - Flags fictional company listings (Stark Industries, Wayne Enterprises, Initech, etc.) with experience discrepancies.
   - Detects suspicious profile patterns (experience year mismatches) and keyword stuffing.
   - Applies a heavy **0.9 penalty** to reduce suspicious profiles' scores to 0.0, safely filtering them from the top ranks.

3. **Weighted Normalized Scoring**:
   - **Technical Skills Match** (35%)
   - **Experience Relevance** (20%)
   - **AI/ML Production Experience** (15%)
   - **Retrieval/Ranking/Search Experience** (10%)
   - **Behavioral Signals** (10%)
   - **Location/Availability Fit** (5%)
   - **Semantic Similarity** (5%)
   - *Scores are normalized between 0.0 and 1.0*.

4. **Vercel Sandbox Dashboard**:
   - Interactive glassmorphic single-page web app with real-time slider weights and CSV download.
   - Hosted live at [https://redrob-ai-ranking-system.vercel.app](https://redrob-ai-ranking-system.vercel.app).
   - Serverless backend degrades gracefully to a custom TF-IDF cosine similarity vectorizer in pure Python to comply with Vercel package size limits.

## Installation & CLI Usage

### Local CLI Execution
1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Place `candidates.jsonl` in the `data/` directory or specify its path.
3. Run the ranker:
   ```bash
   python main.py --candidates ./data/candidates.jsonl --out final_submission.csv
   ```

## Ground Truth Validation
Validate the final CSV output structure using the validator script:
```bash
python validate_submission.py final_submission.csv
```
The output matches all format requirements:
- Exactly 100 rows of data.
- Monotonically decreasing scores.
- Unique ranks (1–100) and candidate IDs.
- Deterministic alphabetical tie-breaking by candidate ID.
- Natural, diverse, and factual justifications.
