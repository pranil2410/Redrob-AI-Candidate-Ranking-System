#!/usr/bin/env python3
"""
Redrob AI Candidate Ranking System — Entrypoint (main.py)
"""

import argparse
import os
from src.parser import stream_candidates
from src.honeypot_detector import detect_honeypot_anomalies
from src.scoring import score_candidate_base
from src.ranker import rank_candidates
from src.export import export_to_csv

def main():
    parser = argparse.ArgumentParser(description="Rank top candidates for Senior AI Engineer job description.")
    parser.add_argument("--candidates", required=True, help="Path to candidates.jsonl or sample file.")
    parser.add_argument("--out", required=True, help="Path to output CSV file.")
    args = parser.parse_args()
    
    if not os.path.exists(args.candidates):
        print(f"Error: Candidate file not found at {args.candidates}")
        return
        
    print(f"Reading and base scoring candidates from {args.candidates}...")
    
    candidates_list = []
    total_count = 0
    penalized_count = 0
    
    # Pass 1: Parse and score base parameters
    for cand in stream_candidates(args.candidates):
        total_count += 1
        
        # 1. Audit profile for honeypots
        anomalies = detect_honeypot_anomalies(cand)
        is_suspicious = any(anomalies.values())
        
        # 2. Score category base weights (summing to 95%)
        breakdown = score_candidate_base(cand)
        
        # Compute base score
        base_score = (
            0.35 * breakdown["tech_skills"] + 
            0.20 * breakdown["exp_relevance"] + 
            0.15 * breakdown["ai_ml_production"] + 
            0.10 * breakdown["retrieval_exp"] + 
            0.10 * breakdown["behavioral_signals"] + 
            0.05 * breakdown["location_availability"]
        )
        
        # Deduct penalty if flagged as suspicious
        penalty = 0.9 if is_suspicious else 0.0
        if is_suspicious:
            penalized_count += 1
            
        final_base_score = max(base_score - penalty, 0.0)
        
        candidates_list.append({
            "candidate_id": cand.get("candidate_id"),
            "base_score": final_base_score,
            "breakdown": breakdown,
            "is_suspicious": is_suspicious,
            "cand_obj": cand
        })
        
    print(f"Parsed {total_count} candidate records.")
    print(f"Honeypot trap profiles penalized: {penalized_count}")
    
    # Sort by base score and keep top 1,000 candidates for dynamic semantic similarity matching
    candidates_list.sort(key=lambda x: -x["base_score"])
    top_candidates = candidates_list[:1000]
    
    # Pass 2: Calculate Semantic Similarity (SentenceTransformer)
    print("Computing dynamic semantic similarity and final weighted ranking...")
    ranked_candidates = rank_candidates(top_candidates)
    
    # Pass 3: Export top 100 to CSV
    export_to_csv(ranked_candidates[:100], args.out)

if __name__ == "__main__":
    main()
