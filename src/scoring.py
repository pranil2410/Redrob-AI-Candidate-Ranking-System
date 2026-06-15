#!/usr/bin/env python3
"""
Candidate Category Scoring Engine
"""

from datetime import datetime

# Reference Lists
SERVICE_FIRMS = {
    "tcs", "tata consultancy services", "wipro", "infosys", "accenture", 
    "cognizant", "capgemini", "mphasis", "mindtree", "hcl", "tech mahindra", 
    "l&t", "lnt", "ltimindtree", "cts", "service", "consulting"
}

PRODUCT_FIRMS_OR_STARTUPS = {
    "redrob", "swiggy", "zomato", "paytm", "flipkart", "ola", "uber", "google", 
    "meta", "amazon", "microsoft", "netflix", "apple", "pied piper", "hooli", 
    "stark industries", "wayne enterprises", "initech", "globex", "dunder mifflin", 
    "vandelay industries", "stripe", "atlassian", "salesforce", "adobe", "oracle", 
    "inmobi", "freshworks", "ola electric", "cred", "razorpay", "meesho", "phonepe"
}

TIER1_CITIES = {
    "noida", "pune", "delhi ncr", "delhi", "gurgaon", "gurugram", "ncr", "faridabad",
    "ghaziabad", "bangalore", "bengaluru", "hyderabad", "mumbai", "chennai"
}

PREFERRED_CITIES = {"noida", "pune"}
TODAY = datetime(2026, 6, 15)

def extract_skill_metrics(skills):
    metrics = {
        "embeddings": 0.0,
        "vector_db": 0.0,
        "python": 0.0,
        "evaluation": 0.0,
        "fine_tuning": 0.0,
        "ltr": 0.0,
        "distributed": 0.0,
        "cv_speech_robotics": 0.0,
        "has_langchain": False,
        "has_pre_llm_ml": False,
        "skills_list": []
    }
    
    prof_mult = {"expert": 1.5, "advanced": 1.2, "intermediate": 0.8, "beginner": 0.4}
    
    for s in skills:
        name = s.get("name", "").lower()
        prof = s.get("proficiency", "beginner")
        dur = s.get("duration_months", 0)
        dur_yrs = dur / 12.0
        mult = prof_mult.get(prof, 0.4)
        score = dur_yrs * mult
        
        metrics["skills_list"].append(name)
        
        if any(kw in name for kw in ["embedding", "sentence-transformer", "sentence transformer", "dense retrieval", "e5", "bge", "vector search", "semantic search"]):
            metrics["embeddings"] = max(metrics["embeddings"], score)
            
        if any(kw in name for kw in ["pinecone", "weaviate", "qdrant", "milvus", "opensearch", "elasticsearch", "faiss", "hybrid search", "vector db", "vector database"]):
            metrics["vector_db"] = max(metrics["vector_db"], score)
            
        if name == "python":
            metrics["python"] = max(metrics["python"], score)
            
        if any(kw in name for kw in ["ndcg", "mrr", "map", "a/b testing", "a/b test", "evaluation", "eval framework", "ranking metric"]):
            metrics["evaluation"] = max(metrics["evaluation"], score)
            
        if any(kw in name for kw in ["fine-tuning", "fine tuning", "lora", "qlora", "peft"]):
            metrics["fine_tuning"] = max(metrics["fine_tuning"], score)
            
        if any(kw in name for kw in ["learning to rank", "ltr", "xgboost", "neural ranking"]):
            metrics["ltr"] = max(metrics["ltr"], score)
            
        if any(kw in name for kw in ["distributed system", "inference", "optimization", "parallel", "spark", "triton", "onnx"]):
            metrics["distributed"] = max(metrics["distributed"], score)
            
        if any(kw in name for kw in ["computer vision", "image classification", "object detection", "yolo", "opencv", "cnn", "speech recognition", "tts", "stt", "speech-to-text", "robotics"]):
            metrics["cv_speech_robotics"] += 1
            
        if name == "langchain" or name == "llamaindex":
            metrics["has_langchain"] = True
            
        if any(kw in name for kw in ["scikit-learn", "sklearn", "pytorch", "tensorflow", "xgboost", "keras", "pandas", "numpy"]):
            if dur > 24:
                metrics["has_pre_llm_ml"] = True
                
    return metrics

def score_candidate_base(cand) -> dict:
    """
    Computes normalized sub-scores [0.0, 1.0] for the first 6 categories.
    """
    profile = cand.get("profile", {})
    career = cand.get("career_history", [])
    skills = cand.get("skills", [])
    signals = cand.get("redrob_signals", {})
    
    years_exp = profile.get("years_of_experience", 0.0)
    skill_metrics = extract_skill_metrics(skills)
    
    # 1. Technical Match
    emb_score = min(skill_metrics["embeddings"] * 2.0, 10.0) / 10.0
    vdb_score = min(skill_metrics["vector_db"] * 2.0, 10.0) / 10.0
    py_score = min(skill_metrics["python"] * 1.5, 5.0) / 5.0
    eval_score = min(skill_metrics["evaluation"] * 2.0, 10.0) / 10.0
    
    core_score = 0.2857 * emb_score + 0.2857 * vdb_score + 0.1428 * py_score + 0.2857 * eval_score
    
    nice_bonus = 0.0
    if skill_metrics["fine_tuning"] > 0: nice_bonus += 0.05
    if skill_metrics["ltr"] > 0: nice_bonus += 0.05
    if skill_metrics["distributed"] > 0: nice_bonus += 0.03
    nice_bonus = min(nice_bonus, 0.1)
    
    tech_skills = core_score + nice_bonus
    
    has_nlp_search = (skill_metrics["embeddings"] > 0 or skill_metrics["vector_db"] > 0 or skill_metrics["evaluation"] > 0)
    if skill_metrics["cv_speech_robotics"] >= 3 and not has_nlp_search:
        tech_skills -= 0.2
        
    if skill_metrics["has_langchain"] and not skill_metrics["has_pre_llm_ml"]:
        tech_skills -= 0.15
        
    tech_skills = max(min(tech_skills, 1.0), 0.0)
    
    # 2. Experience Relevance
    if 5.0 <= years_exp <= 9.0:
        yexp_score = 1.0
    elif 4.0 <= years_exp < 5.0:
        yexp_score = 0.8
    elif years_exp < 4.0:
        yexp_score = max(years_exp / 4.0, 0.1)
    else:
        yexp_score = max(1.0 - (years_exp - 9.0) * 0.05, 0.6)
        
    companies = [j.get("company", "").lower() for j in career]
    only_service = True
    has_product = False
    
    for c in companies:
        if c in PRODUCT_FIRMS_OR_STARTUPS:
            has_product = True
        if not any(sf in c for sf in SERVICE_FIRMS):
            only_service = False
            
    if has_product:
        pedigree_score = 1.0
    elif only_service:
        pedigree_score = 0.1
    else:
        pedigree_score = 0.6
        
    tenures = [j.get("duration_months", 0) for j in career]
    avg_tenure_months = sum(tenures) / len(tenures) if tenures else 0
    if len(career) >= 3 and avg_tenure_months < 18:
        pedigree_score = max(pedigree_score - 0.3, 0.1)
        
    exp_relevance = 0.5 * yexp_score + 0.5 * pedigree_score
    
    # 3. AI Production Experience
    ai_prod_score = 0.0
    ml_titles = ["machine learning", "ml", "ai", "artificial intelligence", "nlp", "search", "retrieval", "ranking", "deep learning", "data scientist"]
    for job in career:
        title = job.get("title", "").lower()
        if any(mt in title for mt in ml_titles):
            if job.get("is_current"):
                ai_prod_score += 0.4
            else:
                ai_prod_score += 0.15
    ai_prod_score = min(ai_prod_score, 0.5)
    
    prod_keywords = ["production", "deploy", "ship", "scale", "serve", "kubernetes", "docker", "pipeline", "infrastructure", "aws", "gcp", "azure", "latency", "system design", "metrics"]
    prod_matches = 0
    for job in career:
        desc = job.get("description", "").lower()
        prod_matches += sum(1 for kw in prod_keywords if kw in desc)
    ai_prod_score += min(prod_matches * 0.08, 0.5)
    
    research_keywords = ["research", "paper", "publication", "lab", "academic", "thesis", "phd"]
    research_matches = 0
    for job in career:
        desc = job.get("description", "").lower()
        research_matches += sum(1 for kw in research_keywords if kw in desc)
    if research_matches >= 3 and prod_matches <= 1:
        ai_prod_score = max(ai_prod_score - 0.4, 0.0)
        
    ai_ml_production = min(ai_prod_score, 1.0)
    
    # 4. Retrieval Search Experience
    retrieval_score = 0.0
    search_keywords = ["search", "retrieval", "ranking", "recommendation", "recommender", "vector search", "hybrid search", "rag", "dense retrieval", "bm25", "elasticsearch", "opensearch", "solr", "faiss", "pinecone", "weaviate", "qdrant", "milvus"]
    
    title_matches = 0
    desc_matches = 0
    for job in career:
        title = job.get("title", "").lower()
        desc = job.get("description", "").lower()
        if any(kw in title for kw in ["search", "retrieval", "ranking", "recommendation", "recommender", "ir", "rag"]):
            if job.get("is_current"):
                title_matches += 0.5
            else:
                title_matches += 0.2
        desc_matches += sum(1 for kw in search_keywords if kw in desc)
        
    retrieval_score += min(title_matches, 0.5)
    retrieval_score += min(desc_matches * 0.1, 0.5)
    retrieval_experience = min(retrieval_score, 1.0)
    
    # 5. Behavioral Signals
    beh_score = 0.0
    resp_rate = signals.get("recruiter_response_rate", 0.0)
    beh_score += resp_rate * 0.2
    
    resp_time = signals.get("avg_response_time_hours", 24.0)
    if resp_time <= 2.0: beh_score += 0.2
    elif resp_time <= 8.0: beh_score += 0.15
    elif resp_time <= 24.0: beh_score += 0.1
    elif resp_time <= 48.0: beh_score += 0.05
    
    if signals.get("open_to_work_flag"): beh_score += 0.1
    
    last_act_str = signals.get("last_active_date")
    last_act = None
    if last_act_str:
        try:
            last_act = datetime.strptime(last_act_str, "%Y-%m-%d")
        except ValueError:
            pass
    if last_act:
        days_inactive = (TODAY - last_act).days
        if days_inactive <= 15: beh_score += 0.2
        elif days_inactive <= 30: beh_score += 0.17
        elif days_inactive <= 60: beh_score += 0.12
        elif days_inactive <= 120: beh_score += 0.07
        elif days_inactive <= 180: beh_score += 0.03
        
    github_score = signals.get("github_activity_score", -1)
    if github_score > 0:
        beh_score += min(github_score / 100.0, 1.0) * 0.1
        
    saves = signals.get("saved_by_recruiters_30d", 0)
    views = signals.get("profile_views_received_30d", 0)
    beh_score += min((saves * 0.05 + views * 0.01), 0.1)
    
    verif = 0.0
    if signals.get("verified_email"): verif += 0.03
    if signals.get("verified_phone"): verif += 0.03
    if signals.get("linkedin_connected"): verif += 0.04
    beh_score += verif
    
    completion_rate = signals.get("interview_completion_rate", 1.0)
    if completion_rate < 0.9:
        beh_score = max(beh_score - 0.2, 0.0)
        
    behavioral_signals = min(beh_score, 1.0)
    
    # 6. Location availability Fit
    loc_score = 0.0
    loc_str = profile.get("location", "").lower()
    if any(city in loc_str for city in PREFERRED_CITIES): loc_score += 0.6
    elif any(city in loc_str for city in TIER1_CITIES): loc_score += 0.4
    elif signals.get("willing_to_relocate"): loc_score += 0.3
    
    notice = signals.get("notice_period_days", 90)
    if notice <= 15: loc_score += 0.4
    elif notice <= 30: loc_score += 0.35
    elif notice <= 60: loc_score += 0.2
    elif notice <= 90: loc_score += 0.1
    
    location_availability = min(loc_score, 1.0)
    
    return {
        "tech_skills": tech_skills,
        "exp_relevance": exp_relevance,
        "ai_ml_production": ai_ml_production,
        "retrieval_exp": retrieval_experience,
        "behavioral_signals": behavioral_signals,
        "location_availability": location_availability
    }
