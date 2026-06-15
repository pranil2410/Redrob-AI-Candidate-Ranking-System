#!/usr/bin/env python3
"""
Dedicated Honeypot Detection Module
"""

import re
from datetime import datetime

TODAY = datetime(2026, 6, 15)

# Fictional companies used in honeypots
FICTIONAL_COMPANIES = {
    "stark industries", "wayne enterprises", "initech", "pied piper", "hooli", 
    "tyrell corp", "acme corp", "soylent corp", "cyberdyne systems", "oscorp", 
    "gekko & co", "dunder mifflin", "vandelay industries"
}

def parse_date(d_str):
    if not d_str:
        return None
    try:
        return datetime.strptime(d_str, "%Y-%m-%d")
    except Exception:
        return None

def detect_honeypot_anomalies(cand) -> dict:
    """
    Analyzes a candidate profile and returns a dictionary of flagged anomalies.
    """
    profile = cand.get("profile", {})
    career = cand.get("career_history", [])
    skills = cand.get("skills", [])
    summary = profile.get("summary", "")
    profile_years = profile.get("years_of_experience", 0.0)
    
    anomalies = {
        "impossible_timeline": False,
        "unrealistic_promotion": False,
        "contradictory_skills": False,
        "fake_company_history": False,
        "suspicious_profile_pattern": False,
        "keyword_stuffing": False
    }
    
    # 1. Impossible experience timelines
    # Check 1a: claimed duration > elapsed calendar months
    for job in career:
        start = parse_date(job.get("start_date"))
        end = parse_date(job.get("end_date")) if job.get("end_date") else TODAY
        dur = job.get("duration_months", 0)
        if start and end:
            elapsed = (end.year - start.year) * 12 + (end.month - start.month)
            if dur > elapsed + 2:
                anomalies["impossible_timeline"] = True
                break
                
    # Check 1b: overlapping job timelines (> 6 months) for full-time roles
    intervals = []
    for job in career:
        title = job.get("title", "").lower()
        if "intern" in title or "part-time" in title or "part time" in title:
            continue
        start = parse_date(job.get("start_date"))
        end = parse_date(job.get("end_date")) if job.get("end_date") else TODAY
        if start and end:
            intervals.append((start, end))
    intervals.sort()
    for i in range(len(intervals)-1):
        s1, e1 = intervals[i]
        s2, e2 = intervals[i+1]
        if s2 < e1:
            overlap = (e1.year - s2.year) * 12 + (e1.month - s2.month)
            if overlap > 6:
                anomalies["impossible_timeline"] = True
                break
                
    # 2. Unrealistic promotions (< 6 months)
    # E.g. Intern/Junior to VP/Lead in under 6 months
    sorted_jobs = []
    for job in career:
        s = parse_date(job.get("start_date"))
        if s:
            sorted_jobs.append((s, job))
    sorted_jobs.sort()
    for i in range(len(sorted_jobs)-1):
        s1, j1 = sorted_jobs[i]
        s2, j2 = sorted_jobs[i+1]
        t1 = j1.get("title", "").lower()
        t2 = j2.get("title", "").lower()
        elapsed = (s2.year - s1.year) * 12 + (s2.month - s1.month)
        is_junior = any(kw in t1 for kw in ["intern", "junior", "trainee", "associate"])
        is_senior = any(kw in t2 for kw in ["lead", "principal", "director", "vp", "chief", "founder", "head"])
        if is_junior and is_senior and elapsed < 6:
            anomalies["unrealistic_promotion"] = True
            break
            
    # 3. Contradictory skills
    # Check 3a: expert/advanced skill with 0 duration
    zero_dur = sum(1 for s in skills if s.get("duration_months") == 0 and s.get("proficiency") in ["expert", "advanced"])
    if zero_dur > 0:
        anomalies["contradictory_skills"] = True
        
    # Check 3b: non-tech role claiming expert tech skills
    non_tech_titles = ["marketing", "sales", "accountant", "recruiter", "hr manager", "human resources", "content writer", "operations manager"]
    curr_title = profile.get("current_title", "").lower()
    if any(nt in curr_title for nt in non_tech_titles):
        tech_skills = ["pytorch", "tensorflow", "faiss", "pinecone", "weaviate", "qdrant", "milvus", "embeddings", "vector", "llm", "fine-tuning", "machine learning", "deep learning", "nlp"]
        expert_tech_count = sum(1 for s in skills if s.get("proficiency") in ["expert", "advanced"] and any(ts in s.get("name", "").lower() for ts in tech_skills))
        if expert_tech_count >= 3:
            anomalies["contradictory_skills"] = True
            
    # 4. Fake company history
    has_fictional = any(job.get("company", "").lower() in FICTIONAL_COMPANIES for job in career)
    if has_fictional:
        total_career_months = sum(job.get("duration_months", 0) for job in career)
        total_career_years = total_career_months / 12.0
        if abs(profile_years - total_career_years) > 1.0:
            anomalies["fake_company_history"] = True
            
    # 5. Suspicious profile patterns
    total_career_months = sum(job.get("duration_months", 0) for job in career)
    total_career_years = total_career_months / 12.0
    if abs(profile_years - total_career_years) > 2.0:
        anomalies["suspicious_profile_pattern"] = True
        
    match = re.search(r"(\d+(?:\.\d+)?)(?:\+|)?\s+years?\s+of\s+experience", summary, re.IGNORECASE)
    if match:
        try:
            summary_years = float(match.group(1))
            if abs(profile_years - summary_years) > 2.0:
                anomalies["suspicious_profile_pattern"] = True
        except ValueError:
            pass
            
    # 6. Keyword stuffing
    if len(skills) > 30 and profile_years < 3.0:
        anomalies["keyword_stuffing"] = True
        
    tech_skills = ["embeddings", "vector", "lora", "fine-tuning", "machine learning", "deep learning", "nlp", "pytorch", "faiss", "pinecone", "milvus", "weaviate", "qdrant"]
    tech_skills_count = sum(1 for s in skills if any(ts in s.get("name", "").lower() for ts in tech_skills))
    if tech_skills_count >= 10 and profile_years < 3.0:
        anomalies["keyword_stuffing"] = True
        
    return anomalies
