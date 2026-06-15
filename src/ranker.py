#!/usr/bin/env python3
"""
Candidate Ranking Engine & Semantic Similarity Matcher
"""

import re
import math
from src.parser import get_job_description

try:
    import torch
    from sentence_transformers import SentenceTransformer, util
    HAS_TRANSFORMERS = True
except ImportError:
    HAS_TRANSFORMERS = False

def simple_tfidf_similarity(texts, query_text):
    """
    Computes cosine similarity using TF-IDF in pure Python.
    """
    def tokenize(text):
        return re.findall(r"\w+", text.lower())
    query_tokens = tokenize(query_text)
    query_tf = {}
    for t in query_tokens:
        query_tf[t] = query_tf.get(t, 0) + 1
    dfs = {}
    doc_tfs = []
    for txt in texts:
        tokens = tokenize(txt)
        tf = {}
        seen = set()
        for t in tokens:
            tf[t] = tf.get(t, 0) + 1
            if t not in seen:
                dfs[t] = dfs.get(t, 0) + 1
                seen.add(t)
        doc_tfs.append(tf)
    N = len(texts)
    similarities = []
    for tf in doc_tfs:
        dot_product = 0.0
        query_norm = 0.0
        doc_norm = 0.0
        all_terms = set(query_tf.keys()).union(tf.keys())
        for term in all_terms:
            df = dfs.get(term, 0)
            idf = math.log((1.0 + N) / (1.0 + df)) + 1.0 if N > 0 else 1.0
            w_q = query_tf.get(term, 0) * idf
            w_d = tf.get(term, 0) * idf
            dot_product += w_q * w_d
            query_norm += w_q * w_q
            doc_norm += w_d * w_d
        if query_norm > 0 and doc_norm > 0:
            sim = dot_product / (math.sqrt(query_norm) * math.sqrt(doc_norm))
        else:
            sim = 0.0
        similarities.append(sim)
    return similarities

def rank_candidates(candidates_data, custom_weights=None):
    """
    Runs Pass 2 ranking: computes semantic similarity for the top candidates,
    sums the weighted normalized category scores, and returns sorted candidates.
    """
    if not candidates_data:
        return []
        
    weights = custom_weights or {
        "tech_skills": 0.35,
        "exp_relevance": 0.20,
        "ai_ml_production": 0.15,
        "retrieval_exp": 0.10,
        "behavioral_signals": 0.10,
        "location_availability": 0.05,
        "semantic_similarity": 0.05
    }
    
    jd_text = get_job_description()
    
    # Extract candidate profiles text for encoding
    cand_texts = []
    for item in candidates_data:
        profile = item["cand_obj"].get("profile", {})
        skills = item["cand_obj"].get("skills", [])
        title = profile.get("current_title", "")
        headline = profile.get("headline", "")
        skills_str = ", ".join([s.get("name", "") for s in skills])
        cand_text = f"{title}. {headline}. Skills: {skills_str}."
        cand_texts.append(cand_text)
        
    similarity_scores = []
    if HAS_TRANSFORMERS:
        print("Using SentenceTransformers (all-MiniLM-L6-v2) on CPU for semantic similarity...")
        try:
            model = SentenceTransformer("all-MiniLM-L6-v2", device="cpu")
            jd_embedding = model.encode(jd_text, convert_to_tensor=True)
            cand_embeddings = model.encode(cand_texts, convert_to_tensor=True)
            similarities = util.cos_sim(cand_embeddings, jd_embedding).squeeze(1).cpu().tolist()
            similarity_scores = similarities
        except Exception as e:
            print(f"SentenceTransformers failed: {e}. Falling back to TF-IDF.")
            similarity_scores = simple_tfidf_similarity(cand_texts, jd_text)
    else:
        print("SentenceTransformers package not found. Falling back to TF-IDF...")
        similarity_scores = simple_tfidf_similarity(cand_texts, jd_text)
        
    # Normalize similarity scores to [0.0, 1.0] across this batch
    if similarity_scores:
        min_sim = min(similarity_scores)
        max_sim = max(similarity_scores)
        sim_range = max_sim - min_sim
        norm_sims = [(s - min_sim) / sim_range if sim_range > 0 else 0.5 for s in similarity_scores]
    else:
        norm_sims = [0.0 for _ in candidates_data]
        
    # Compute final score
    for idx, item in enumerate(candidates_data):
        sim_val = norm_sims[idx]
        item["breakdown"]["semantic_similarity"] = sim_val
        
        if item["is_suspicious"]:
            item["final_score"] = 0.0
        else:
            weighted_score = (
                weights["tech_skills"] * item["breakdown"]["tech_skills"] +
                weights["exp_relevance"] * item["breakdown"]["exp_relevance"] +
                weights["ai_ml_production"] * item["breakdown"]["ai_ml_production"] +
                weights["retrieval_exp"] * item["breakdown"]["retrieval_exp"] +
                weights["behavioral_signals"] * item["breakdown"]["behavioral_signals"] +
                weights["location_availability"] * item["breakdown"]["location_availability"] +
                weights["semantic_similarity"] * sim_val
            )
            item["final_score"] = round(weighted_score, 4)
            
    # Sort by final score descending and candidate_id ascending
    candidates_data.sort(key=lambda x: (-x["final_score"], x["candidate_id"]))
    
    return candidates_data
