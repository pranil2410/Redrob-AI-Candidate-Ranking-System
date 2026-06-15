// Redrob AI Candidate Ranking System — worker.js
// Runs candidate parsing, honeypot audits, scoring, and semantic ranking in a background thread.

const TODAY = new Date("2026-06-15");
const FICTIONAL_COMPANIES = new Set([
  "stark industries", "wayne enterprises", "initech", "pied piper", "hooli", 
  "tyrell corp", "acme corp", "soylent corp", "cyberdyne systems", "oscorp", 
  "gekko & co", "dunder mifflin", "vandelay industries"
]);

const SERVICE_FIRMS = new Set([
  "tcs", "tata consultancy services", "wipro", "infosys", "accenture", 
  "cognizant", "capgemini", "mphasis", "mindtree", "hcl", "tech mahindra", 
  "l&t", "lnt", "ltimindtree", "cts", "service", "consulting"
]);

const PRODUCT_FIRMS_OR_STARTUPS = new Set([
  "redrob", "swiggy", "zomato", "paytm", "flipkart", "ola", "uber", "google", 
  "meta", "amazon", "microsoft", "netflix", "apple", "pied piper", "hooli", 
  "stark industries", "wayne enterprises", "initech", "globex", "dunder mifflin", 
  "vandelay industries", "stripe", "atlassian", "salesforce", "adobe", "oracle", 
  "inmobi", "freshworks", "ola electric", "cred", "razorpay", "meesho", "phonepe"
]);

const TIER1_CITIES = new Set([
  "noida", "pune", "delhi ncr", "delhi", "gurgaon", "gurugram", "ncr", "faridabad",
  "ghaziabad", "bangalore", "bengaluru", "hyderabad", "mumbai", "chennai"
]);

const PREFERRED_CITIES = new Set(["noida", "pune"]);

// Job Description Text
const JD_TEXT = "Senior AI Engineer, Founding Team. Production experience with embeddings-based retrieval systems (sentence-transformers, OpenAI embeddings, BGE, E5, dense retrieval, vector search, semantic search), vector databases or hybrid search infrastructure (Pinecone, Weaviate, Qdrant, Milvus, OpenSearch, Elasticsearch, FAISS), strong Python, evaluation frameworks for ranking systems (NDCG, MRR, MAP, A/B testing). Applied ML/AI models shipped to production.";

// Helper to parse dates formatted as YYYY-MM-DD
function parseDate(dStr) {
  if (!dStr) return null;
  const parts = dStr.split("-");
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return new Date(year, month - 1, day);
}

// Helper to get months difference
function getMonthsBetween(d1, d2) {
  return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
}

// Honeypot Audit Module
function detectHoneypotAnomalies(cand) {
  const profile = cand.profile || {};
  const career = cand.career_history || [];
  const skills = cand.skills || [];
  const summary = profile.summary || "";
  const profileYears = profile.years_of_experience || 0.0;
  
  const anomalies = {
    impossible_timeline: false,
    unrealistic_promotion: false,
    contradictory_skills: false,
    fake_company_history: false,
    suspicious_profile_pattern: false,
    keyword_stuffing: false
  };
  
  // 1a. Impossible timelines: claimed duration > elapsed calendar months
  for (const job of career) {
    const start = parseDate(job.start_date);
    const end = job.end_date ? parseDate(job.end_date) : TODAY;
    const dur = job.duration_months || 0;
    if (start && end) {
      const elapsed = getMonthsBetween(start, end);
      if (dur > elapsed + 2) {
        anomalies.impossible_timeline = true;
        break;
      }
    }
  }
  
  // 1b. Overlapping job timelines (> 6 months) for full-time roles
  if (!anomalies.impossible_timeline) {
    const intervals = [];
    for (const job of career) {
      const title = (job.title || "").toLowerCase();
      if (title.includes("intern") || title.includes("part-time") || title.includes("part time")) {
        continue;
      }
      const start = parseDate(job.start_date);
      const end = job.end_date ? parseDate(job.end_date) : TODAY;
      if (start && end) {
        intervals.push({ start, end });
      }
    }
    intervals.sort((a, b) => a.start - b.start);
    for (let i = 0; i < intervals.length - 1; i++) {
      const i1 = intervals[i];
      const i2 = intervals[i + 1];
      if (i2.start < i1.end) {
        const overlap = getMonthsBetween(i2.start, i1.end < i2.end ? i1.end : i2.end);
        if (overlap > 6) {
          anomalies.impossible_timeline = true;
          break;
        }
      }
    }
  }
  
  // 2. Unrealistic promotions (< 6 months)
  const sortedJobs = [];
  for (const job of career) {
    const start = parseDate(job.start_date);
    if (start) {
      sortedJobs.push({ start, job });
    }
  }
  sortedJobs.sort((a, b) => a.start - b.start);
  for (let i = 0; i < sortedJobs.length - 1; i++) {
    const s1 = sortedJobs[i].start;
    const j1 = sortedJobs[i].job;
    const s2 = sortedJobs[i + 1].start;
    const j2 = sortedJobs[i + 1].job;
    
    const t1 = (j1.title || "").toLowerCase();
    const t2 = (j2.title || "").toLowerCase();
    const elapsed = getMonthsBetween(s1, s2);
    
    const isJunior = ["intern", "junior", "trainee", "associate"].some(kw => t1.includes(kw));
    const isSenior = ["lead", "principal", "director", "vp", "chief", "founder", "head"].some(kw => t2.includes(kw));
    
    if (isJunior && isSenior && elapsed < 6) {
      anomalies.unrealistic_promotion = true;
      break;
    }
  }
  
  // 3a. Expert/advanced skill with 0 duration
  const zeroDur = skills.filter(s => (s.duration_months === 0 || s.duration_months === null) && ["expert", "advanced"].includes(s.proficiency)).length;
  if (zeroDur > 0) {
    anomalies.contradictory_skills = true;
  }
  
  // 3b. Non-tech role claiming expert tech skills
  const nonTechTitles = ["marketing", "sales", "accountant", "recruiter", "hr manager", "human resources", "content writer", "operations manager"];
  const currTitle = (profile.current_title || "").toLowerCase();
  if (nonTechTitles.some(nt => currTitle.includes(nt))) {
    const techSkills = ["pytorch", "tensorflow", "faiss", "pinecone", "weaviate", "qdrant", "milvus", "embeddings", "vector", "llm", "fine-tuning", "machine learning", "deep learning", "nlp"];
    const expertTechCount = skills.filter(s => 
      ["expert", "advanced"].includes(s.proficiency) && 
      techSkills.some(ts => (s.name || "").toLowerCase().includes(ts))
    ).length;
    if (expertTechCount >= 3) {
      anomalies.contradictory_skills = true;
    }
  }
  
  // 4. Fake company history
  const hasFictional = career.some(job => FICTIONAL_COMPANIES.has((job.company || "").toLowerCase()));
  let totalCareerMonths = 0;
  for (const job of career) {
    totalCareerMonths += job.duration_months || 0;
  }
  const totalCareerYears = totalCareerMonths / 12.0;
  if (hasFictional) {
    if (Math.abs(profileYears - totalCareerYears) > 1.0) {
      anomalies.fake_company_history = true;
    }
  }
  
  // 5. Suspicious profile patterns
  if (Math.abs(profileYears - totalCareerYears) > 2.0) {
    anomalies.suspicious_profile_pattern = true;
  }
  const match = summary.match(/(\d+(?:\.\d+)?)(?:\+|)?\s+years?\s+of\s+experience/i);
  if (match) {
    const summaryYears = parseFloat(match[1]);
    if (!isNaN(summaryYears)) {
      if (Math.abs(profileYears - summaryYears) > 2.0) {
        anomalies.suspicious_profile_pattern = true;
      }
    }
  }
  
  // 6. Keyword stuffing
  if (skills.length > 30 && profileYears < 3.0) {
    anomalies.keyword_stuffing = true;
  }
  const techSkillsList = ["embeddings", "vector", "lora", "fine-tuning", "machine learning", "deep learning", "nlp", "pytorch", "faiss", "pinecone", "milvus", "weaviate", "qdrant"];
  const techSkillsCount = skills.filter(s => techSkillsList.some(ts => (s.name || "").toLowerCase().includes(ts))).length;
  if (techSkillsCount >= 10 && profileYears < 3.0) {
    anomalies.keyword_stuffing = true;
  }
  
  return anomalies;
}

// Feature extraction and sub-scoring
function extractSkillMetrics(skills) {
  const metrics = {
    embeddings: 0.0,
    vector_db: 0.0,
    python: 0.0,
    evaluation: 0.0,
    fine_tuning: 0.0,
    ltr: 0.0,
    distributed: 0.0,
    cv_speech_robotics: 0.0,
    has_langchain: false,
    has_pre_llm_ml: false,
    skills_list: []
  };
  
  const profMult = { expert: 1.5, advanced: 1.2, intermediate: 0.8, beginner: 0.4 };
  
  for (const s of skills) {
    const name = (s.name || "").toLowerCase();
    const prof = s.proficiency || "beginner";
    const dur = s.duration_months || 0;
    const durYrs = dur / 12.0;
    const mult = profMult[prof] || 0.4;
    const score = durYrs * mult;
    
    metrics.skills_list.push(name);
    
    if (["embedding", "sentence-transformer", "sentence transformer", "dense retrieval", "e5", "bge", "vector search", "semantic search"].some(kw => name.includes(kw))) {
      metrics.embeddings = Math.max(metrics.embeddings, score);
    }
    if (["pinecone", "weaviate", "qdrant", "milvus", "opensearch", "elasticsearch", "faiss", "hybrid search", "vector db", "vector database"].some(kw => name.includes(kw))) {
      metrics.vector_db = Math.max(metrics.vector_db, score);
    }
    if (name === "python") {
      metrics.python = Math.max(metrics.python, score);
    }
    if (["ndcg", "mrr", "map", "a/b testing", "a/b test", "evaluation", "eval framework", "ranking metric"].some(kw => name.includes(kw))) {
      metrics.evaluation = Math.max(metrics.evaluation, score);
    }
    if (["fine-tuning", "fine tuning", "lora", "qlora", "peft"].some(kw => name.includes(kw))) {
      metrics.fine_tuning = Math.max(metrics.fine_tuning, score);
    }
    if (["learning to rank", "ltr", "xgboost", "neural ranking"].some(kw => name.includes(kw))) {
      metrics.ltr = Math.max(metrics.ltr, score);
    }
    if (["distributed system", "inference", "optimization", "parallel", "spark", "triton", "onnx"].some(kw => name.includes(kw))) {
      metrics.distributed = Math.max(metrics.distributed, score);
    }
    if (["computer vision", "image classification", "object detection", "yolo", "opencv", "cnn", "speech recognition", "tts", "stt", "speech-to-text", "robotics"].some(kw => name.includes(kw))) {
      metrics.cv_speech_robotics += 1;
    }
    if (name === "langchain" || name === "llamaindex") {
      metrics.has_langchain = true;
    }
    if (["scikit-learn", "sklearn", "pytorch", "tensorflow", "xgboost", "keras", "pandas", "numpy"].some(kw => name.includes(kw))) {
      if (dur > 24) {
        metrics.has_pre_llm_ml = true;
      }
    }
  }
  return metrics;
}

function scoreCandidateBase(cand) {
  const profile = cand.profile || {};
  const career = cand.career_history || [];
  const skills = cand.skills || [];
  const signals = cand.redrob_signals || {};
  
  const yearsExp = profile.years_of_experience || 0.0;
  const skillMetrics = extractSkillMetrics(skills);
  
  // 1. Technical Match
  const embScore = Math.min(skillMetrics.embeddings * 2.0, 10.0) / 10.0;
  const vdbScore = Math.min(skillMetrics.vector_db * 2.0, 10.0) / 10.0;
  const pyScore = Math.min(skillMetrics.python * 1.5, 5.0) / 5.0;
  const evalScore = Math.min(skillMetrics.evaluation * 2.0, 10.0) / 10.0;
  
  const coreScore = 0.2857 * embScore + 0.2857 * vdbScore + 0.1428 * pyScore + 0.2857 * evalScore;
  
  let niceBonus = 0.0;
  if (skillMetrics.fine_tuning > 0) niceBonus += 0.05;
  if (skillMetrics.ltr > 0) niceBonus += 0.05;
  if (skillMetrics.distributed > 0) niceBonus += 0.03;
  niceBonus = Math.min(niceBonus, 0.1);
  
  let techSkills = coreScore + niceBonus;
  
  const hasNlpSearch = (skillMetrics.embeddings > 0 || skillMetrics.vector_db > 0 || skillMetrics.evaluation > 0);
  if (skillMetrics.cv_speech_robotics >= 3 && !hasNlpSearch) {
    techSkills -= 0.2;
  }
  if (skillMetrics.has_langchain && !skillMetrics.has_pre_llm_ml) {
    techSkills -= 0.15;
  }
  techSkills = Math.max(Math.min(techSkills, 1.0), 0.0);
  
  // 2. Experience Relevance
  let yexpScore = 0.0;
  if (yearsExp >= 5.0 && yearsExp <= 9.0) {
    yexpScore = 1.0;
  } else if (yearsExp >= 4.0 && yearsExp < 5.0) {
    yexpScore = 0.8;
  } else if (yearsExp < 4.0) {
    yexpScore = Math.max(yearsExp / 4.0, 0.1);
  } else {
    yexpScore = Math.max(1.0 - (yearsExp - 9.0) * 0.05, 0.6);
  }
  
  const companies = career.map(j => (j.company || "").toLowerCase());
  let onlyService = true;
  let hasProduct = false;
  
  for (const c of companies) {
    if (PRODUCT_FIRMS_OR_STARTUPS.has(c)) {
      hasProduct = true;
    }
    let matchesService = false;
    for (const sf of SERVICE_FIRMS) {
      if (c.includes(sf)) {
        matchesService = true;
        break;
      }
    }
    if (!matchesService) {
      onlyService = false;
    }
  }
  
  let pedigreeScore = 0.6;
  if (hasProduct) {
    pedigreeScore = 1.0;
  } else if (onlyService) {
    pedigreeScore = 0.1;
  }
  
  const tenures = career.map(j => j.duration_months || 0);
  const totalTenure = tenures.reduce((a, b) => a + b, 0);
  const avgTenureMonths = tenures.length > 0 ? totalTenure / tenures.length : 0;
  if (career.length >= 3 && avgTenureMonths < 18) {
    pedigreeScore = Math.max(pedigreeScore - 0.3, 0.1);
  }
  
  const expRelevance = 0.5 * yexpScore + 0.5 * pedigreeScore;
  
  // 3. AI Production Experience
  let aiProdScore = 0.0;
  const mlTitles = ["machine learning", "ml", "ai", "artificial intelligence", "nlp", "search", "retrieval", "ranking", "deep learning", "data scientist"];
  for (const job of career) {
    const title = (job.title || "").toLowerCase();
    if (mlTitles.some(mt => title.includes(mt))) {
      if (job.is_current) {
        aiProdScore += 0.4;
      } else {
        aiProdScore += 0.15;
      }
    }
  }
  aiProdScore = Math.min(aiProdScore, 0.5);
  
  const prodKeywords = ["production", "deploy", "ship", "scale", "serve", "kubernetes", "docker", "pipeline", "infrastructure", "aws", "gcp", "azure", "latency", "system design", "metrics"];
  let prodMatches = 0;
  for (const job of career) {
    const desc = (job.description || "").toLowerCase();
    for (const kw of prodKeywords) {
      if (desc.includes(kw)) prodMatches++;
    }
  }
  aiProdScore += Math.min(prodMatches * 0.08, 0.5);
  
  const researchKeywords = ["research", "paper", "publication", "lab", "academic", "thesis", "phd"];
  let researchMatches = 0;
  for (const job of career) {
    const desc = (job.description || "").toLowerCase();
    for (const kw of researchKeywords) {
      if (desc.includes(kw)) researchMatches++;
    }
  }
  if (researchMatches >= 3 && prodMatches <= 1) {
    aiProdScore = Math.max(aiProdScore - 0.4, 0.0);
  }
  const aiMlProduction = Math.min(aiProdScore, 1.0);
  
  // 4. Retrieval Search Experience
  let retrievalScore = 0.0;
  const searchKeywords = ["search", "retrieval", "ranking", "recommendation", "recommender", "vector search", "hybrid search", "rag", "dense retrieval", "bm25", "elasticsearch", "opensearch", "solr", "faiss", "pinecone", "weaviate", "qdrant", "milvus"];
  
  let titleMatches = 0;
  let descMatches = 0;
  for (const job of career) {
    const title = (job.title || "").toLowerCase();
    const desc = (job.description || "").toLowerCase();
    if (["search", "retrieval", "ranking", "recommendation", "recommender", "ir", "rag"].some(kw => title.includes(kw))) {
      if (job.is_current) {
        titleMatches += 0.5;
      } else {
        titleMatches += 0.2;
      }
    }
    for (const kw of searchKeywords) {
      if (desc.includes(kw)) descMatches++;
    }
  }
  retrievalScore += Math.min(titleMatches, 0.5);
  retrievalScore += Math.min(descMatches * 0.1, 0.5);
  const retrievalExperience = Math.min(retrievalScore, 1.0);
  
  // 5. Behavioral Signals
  let behScore = 0.0;
  const respRate = signals.recruiter_response_rate || 0.0;
  behScore += respRate * 0.2;
  
  const respTime = signals.avg_response_time_hours !== undefined ? signals.avg_response_time_hours : 24.0;
  if (respTime <= 2.0) behScore += 0.2;
  else if (respTime <= 8.0) behScore += 0.15;
  else if (respTime <= 24.0) behScore += 0.1;
  else if (respTime <= 48.0) behScore += 0.05;
  
  if (signals.open_to_work_flag) behScore += 0.1;
  
  const lastActStr = signals.last_active_date;
  let lastAct = null;
  if (lastActStr) {
    const parts = lastActStr.split("-");
    if (parts.length === 3) {
      lastAct = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
  }
  if (lastAct) {
    const diffTime = Math.abs(TODAY - lastAct);
    const daysInactive = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (daysInactive <= 15) behScore += 0.2;
    else if (daysInactive <= 30) behScore += 0.17;
    else if (daysInactive <= 60) behScore += 0.12;
    else if (daysInactive <= 120) behScore += 0.07;
    else if (daysInactive <= 180) behScore += 0.03;
  }
  
  const githubScore = signals.github_activity_score !== undefined ? signals.github_activity_score : -1;
  if (githubScore > 0) {
    behScore += Math.min(githubScore / 100.0, 1.0) * 0.1;
  }
  
  const saves = signals.saved_by_recruiters_30d || 0;
  const views = signals.profile_views_received_30d || 0;
  behScore += Math.min((saves * 0.05 + views * 0.01), 0.1);
  
  let verif = 0.0;
  if (signals.verified_email) verif += 0.03;
  if (signals.verified_phone) verif += 0.03;
  if (signals.linkedin_connected) verif += 0.04;
  behScore += verif;
  
  const completionRate = signals.interview_completion_rate !== undefined ? signals.interview_completion_rate : 1.0;
  if (completionRate < 0.9) {
    behScore = Math.max(behScore - 0.2, 0.0);
  }
  const behavioralSignals = Math.min(behScore, 1.0);
  
  // 6. Location availability Fit
  let locScore = 0.0;
  const locStr = (profile.location || "").toLowerCase();
  let cityMatch = false;
  for (const city of PREFERRED_CITIES) {
    if (locStr.includes(city)) {
      cityMatch = true;
      break;
    }
  }
  if (cityMatch) {
    locScore += 0.6;
  } else {
    let tier1Match = false;
    for (const city of TIER1_CITIES) {
      if (locStr.includes(city)) {
        tier1Match = true;
        break;
      }
    }
    if (tier1Match) {
      locScore += 0.4;
    } else if (signals.willing_to_relocate) {
      locScore += 0.3;
    }
  }
  
  const notice = signals.notice_period_days !== undefined ? signals.notice_period_days : 90;
  if (notice <= 15) locScore += 0.4;
  else if (notice <= 30) locScore += 0.35;
  else if (notice <= 60) locScore += 0.2;
  else if (notice <= 90) locScore += 0.1;
  
  const locationAvailability = Math.min(locScore, 1.0);
  
  return {
    tech_skills: techSkills,
    exp_relevance: expRelevance,
    ai_ml_production: aiMlProduction,
    retrieval_exp: retrievalExperience,
    behavioral_signals: behavioralSignals,
    location_availability: locationAvailability
  };
}

// Pure JS TF-IDF Cosine Similarity
function simpleTfidfSimilarity(texts, queryText) {
  function tokenize(text) {
    return (text || "").toLowerCase().match(/\w+/g) || [];
  }
  const queryTokens = tokenize(queryText);
  const queryTf = {};
  for (const t of queryTokens) {
    queryTf[t] = (queryTf[t] || 0) + 1;
  }
  
  const dfs = {};
  const docTfs = [];
  for (const txt of texts) {
    const tokens = tokenize(txt);
    const tf = {};
    const seen = new Set();
    for (const t of tokens) {
      tf[t] = (tf[t] || 0) + 1;
      if (!seen.has(t)) {
        dfs[t] = (dfs[t] || 0) + 1;
        seen.add(t);
      }
    }
    docTfs.push(tf);
  }
  
  const N = texts.length;
  const similarities = [];
  for (const tf of docTfs) {
    let dotProduct = 0.0;
    let queryNorm = 0.0;
    let docNorm = 0.0;
    const allTerms = new Set([...Object.keys(queryTf), ...Object.keys(tf)]);
    for (const term of allTerms) {
      const df = dfs[term] || 0;
      const idf = N > 0 ? Math.log((1.0 + N) / (1.0 + df)) + 1.0 : 1.0;
      const w_q = (queryTf[term] || 0) * idf;
      const w_d = (tf[term] || 0) * idf;
      dotProduct += w_q * w_d;
      queryNorm += w_q * w_q;
      docNorm += w_d * w_d;
    }
    let sim = 0.0;
    if (queryNorm > 0 && docNorm > 0) {
      sim = dotProduct / (Math.sqrt(queryNorm) * Math.sqrt(docNorm));
    }
    similarities.push(sim);
  }
  return similarities;
}

// Generate Reasoning
function generateReasoning(cand, score, breakdown) {
  const profile = cand.profile || {};
  const skills = cand.skills || [];
  const signals = cand.redrob_signals || {};
  const career = cand.career_history || [];
  
  const title = profile.current_title || "Engineer";
  const years = profile.years_of_experience || 0.0;
  const location = profile.location || "India";
  
  const skillNames = skills
    .map(s => s.name || "")
    .filter(name => [
      "embeddings", "vector search", "pinecone", "weaviate", "qdrant", 
      "milvus", "elasticsearch", "opensearch", "nlp", "fine-tuning", 
      "sentence-transformers", "mrr", "ndcg", "map", "faiss"
    ].includes(name.toLowerCase()));
    
  const notice = signals.notice_period_days !== undefined ? signals.notice_period_days : 90;
  
  let hasProduct = false;
  for (const j of career) {
    if (PRODUCT_FIRMS_OR_STARTUPS.has((j.company || "").toLowerCase())) {
      hasProduct = true;
      break;
    }
  }
  
  const openingTemplates = [
    `A strong ${title} with ${years.toFixed(1)} years of experience, bringing hands-on expertise in shipping vector retrieval and matching systems.`,
    `Demonstrates a solid ${years.toFixed(1)}-year track record of engineering search infrastructure and production ranking models.`,
    `Applied ML specialist (${years.toFixed(1)} years) with deep expertise in semantic search, embeddings, and ranking evaluation.`,
    `Product-focused AI Engineer offering ${years.toFixed(1)} years of experience deploying production-ready ML models and vector search.`,
    `Highly qualified candidate with ${years.toFixed(1)} years of experience designing evaluation metrics and embedding-based search indexes.`
  ];
  
  let hashId = 0;
  const cidStr = cand.candidate_id || "CAND_0000000";
  for (let i = 0; i < cidStr.length; i++) {
    hashId += cidStr.charCodeAt(i);
  }
  const opening = openingTemplates[hashId % openingTemplates.length];
  
  const keySkillsStr = skillNames.length > 0 ? skillNames.slice(0, 2).join(", ") : "Python and applied ML";
  const cityMatch = Array.from(PREFERRED_CITIES).some(city => location.toLowerCase().includes(city));
  
  let availability = "";
  if (notice <= 30) availability = "immediate availability";
  else availability = `${notice}-day notice period`;
      
  let secondSentence = "";
  if (score >= 0.85) {
    if (cityMatch) {
      secondSentence = `Combines expert-level skills in ${keySkillsStr} with ${availability} in Pune/Noida, aligning perfectly with our local hub.`;
    } else {
      secondSentence = `Strong fit for Noida/Pune hub (willing to relocate) with expert ${keySkillsStr} skills and ${availability}.`;
    }
  } else if (score >= 0.70) {
    secondSentence = `Possesses solid experience in ${keySkillsStr}; shows active engagement on Redrob and ${availability}.`;
  } else {
    let concern = "";
    if (notice > 60) concern = ` despite a longer ${notice}-day notice period`;
    else if (!hasProduct) concern = " though with primarily IT services pedigree";
    secondSentence = `Demonstrates core capability in ${keySkillsStr}${concern}, matching our baseline requirements.`;
  }
      
  return `${opening} ${secondSentence}`;
}

// On Message from main thread
self.onmessage = function(event) {
  const { file, weights } = event.data;
  
  // Weights parsing and normalization
  const wTech = weights.tech_skills || 0;
  const wExp = weights.exp_relevance || 0;
  const wAi = weights.ai_ml_production || 0;
  const wRet = weights.retrieval_exp || 0;
  const wBeh = weights.behavioral_signals || 0;
  const wLoc = weights.location_availability || 0;
  const wSim = weights.semantic_similarity || 0;
  
  const totW = wTech + wExp + wAi + wRet + wBeh + wLoc + wSim;
  let normW = { tech: 0.35, exp: 0.20, ai: 0.15, ret: 0.10, beh: 0.10, loc: 0.05, sim: 0.05 };
  if (totW > 0) {
    normW.tech = wTech / totW;
    normW.exp = wExp / totW;
    normW.ai = wAi / totW;
    normW.ret = wRet / totW;
    normW.beh = wBeh / totW;
    normW.loc = wLoc / totW;
    normW.sim = wSim / totW;
  }

  let totalPool = 0;
  let honeypots = 0;
  const candidatesList = [];
  
  try {
    const reader = new FileReaderSync();
    const decoder = new TextDecoder("utf-8");
    const chunkSize = 16 * 1024 * 1024; // 16MB chunks for fast reading
    let offset = 0;
    let partialLine = "";
    
    while (offset < file.size) {
      const slice = file.slice(offset, offset + chunkSize);
      const arrayBuffer = reader.readAsArrayBuffer(slice);
      const text = decoder.decode(arrayBuffer, { stream: true });
      
      const lines = (partialLine + text).split("\n");
      partialLine = lines.pop(); // last element is partial or empty
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
          totalPool++;
          try {
            const cand = JSON.parse(line);
            
            // 1. Audit profile for honeypots
            const anomalies = detectHoneypotAnomalies(cand);
            const isSuspicious = Object.values(anomalies).some(v => v);
            if (isSuspicious) {
              honeypots++;
            }
            
            // 2. Score category base weights
            const breakdown = scoreCandidateBase(cand);
            
            // Compute base score (without semantic similarity)
            const baseScore = (
              normW.tech * breakdown.tech_skills + 
              normW.exp * breakdown.exp_relevance + 
              normW.ai * breakdown.ai_ml_production + 
              normW.ret * breakdown.retrieval_exp + 
              normW.beh * breakdown.behavioral_signals + 
              normW.loc * breakdown.location_availability
            );
            
            const penalty = isSuspicious ? 0.9 : 0.0;
            const finalBaseScore = Math.max(baseScore - penalty, 0.0);
            
            candidatesList.push({
              candidate_id: cand.candidate_id,
              base_score: finalBaseScore,
              breakdown: breakdown,
              is_suspicious: isSuspicious,
              cand_obj: cand
            });
          } catch (e) {
            // Skip broken lines
          }
        }
      }
      
      offset += chunkSize;
      
      // Send progressive parsing status update
      postMessage({
        type: "progress",
        loaded: Math.min(offset, file.size),
        total: file.size,
        totalPool,
        honeypots
      });
    }
    
    // Process remaining partial line if present
    if (partialLine.trim()) {
      totalPool++;
      try {
        const cand = JSON.parse(partialLine);
        const anomalies = detectHoneypotAnomalies(cand);
        const isSuspicious = Object.values(anomalies).some(v => v);
        if (isSuspicious) honeypots++;
        
        const breakdown = scoreCandidateBase(cand);
        const baseScore = (
          normW.tech * breakdown.tech_skills + 
          normW.exp * breakdown.exp_relevance + 
          normW.ai * breakdown.ai_ml_production + 
          normW.ret * breakdown.retrieval_exp + 
          normW.beh * breakdown.behavioral_signals + 
          normW.loc * breakdown.location_availability
        );
        const penalty = isSuspicious ? 0.9 : 0.0;
        const finalBaseScore = Math.max(baseScore - penalty, 0.0);
        
        candidatesList.push({
          candidate_id: cand.candidate_id,
          base_score: finalBaseScore,
          breakdown: breakdown,
          is_suspicious: isSuspicious,
          cand_obj: cand
        });
      } catch (e) {}
    }
    
    // Send final parsing progress update
    postMessage({
      type: "progress",
      loaded: file.size,
      total: file.size,
      totalPool,
      honeypots
    });
    
    // Pass 1 done: sort and keep the top 1,000 for semantic similarity re-ranking
    postMessage({ type: "status", message: "Stage 1 complete. Selecting top 1,000 for semantic matching..." });
    candidatesList.sort((a, b) => b.base_score - a.base_score);
    const topCandidates = candidatesList.slice(0, 1000);
    
    // Pass 2: Calculate Semantic Similarity using TF-IDF cosine similarity
    postMessage({ type: "status", message: "Stage 2: Calculating dense TF-IDF semantic similarities..." });
    const candTexts = [];
    for (let i = 0; i < topCandidates.length; i++) {
      const item = topCandidates[i];
      const p = item.cand_obj.profile || {};
      const skills = item.cand_obj.skills || [];
      const title = p.current_title || "";
      const headline = p.headline || "";
      const skillsStr = skills.map(s => s.name || "").join(", ");
      const candText = `${title}. ${headline}. Skills: ${skillsStr}.`;
      candTexts.push(candText);
    }
    
    let normSims = [];
    if (candTexts.length > 0) {
      const similarityScores = simpleTfidfSimilarity(candTexts, JD_TEXT);
      let minSim = Infinity;
      let maxSim = -Infinity;
      for (let i = 0; i < similarityScores.length; i++) {
        const s = similarityScores[i];
        if (s < minSim) minSim = s;
        if (s > maxSim) maxSim = s;
      }
      const simRange = maxSim - minSim;
      normSims = similarityScores.map(s => simRange > 0 ? (s - minSim) / simRange : 0.5);
    } else {
      normSims = topCandidates.map(() => 0.0);
    }
    
    // Apply final scores
    for (let i = 0; i < topCandidates.length; i++) {
      const item = topCandidates[i];
      const simVal = normSims[i];
      item.breakdown.semantic_similarity = simVal;
      
      if (item.is_suspicious) {
        item.final_score = 0.0;
      } else {
        const weightedScore = item.base_score + normW.sim * simVal;
        item.final_score = Math.round(weightedScore * 10000) / 10000;
      }
    }
    
    // Final Sorting by final_score descending and candidate_id ascending (tie-breaker)
    postMessage({ type: "status", message: "Finalizing and sorting rankings..." });
    topCandidates.sort((a, b) => {
      if (b.final_score !== a.final_score) {
        return b.final_score - a.final_score;
      }
      return (a.candidate_id || "").localeCompare(b.candidate_id || "");
    });
    
    // Map response results (limit to top 1,000 for display, top 100 for actual submission)
    const results = topCandidates.map((item, idx) => {
      const score = item.final_score;
      const reasoning = generateReasoning(item.cand_obj, score, item.breakdown);
      return {
        candidate_id: item.candidate_id,
        rank: idx + 1,
        score: score,
        reasoning: reasoning,
        is_suspicious: item.is_suspicious,
        breakdown: item.breakdown,
        profile: {
          name: item.cand_obj.profile ? item.cand_obj.profile.anonymized_name : "Anonymized Candidate",
          title: item.cand_obj.profile ? item.cand_obj.profile.current_title : "",
          company: item.cand_obj.profile ? item.cand_obj.profile.current_company : "",
          years: item.cand_obj.profile ? item.cand_obj.profile.years_of_experience : 0.0,
          location: item.cand_obj.profile ? item.cand_obj.profile.location : ""
        }
      };
    });
    
    postMessage({
      type: "done",
      results: results
    });
    
  } catch (error) {
    postMessage({
      type: "error",
      error: error.message || String(error)
    });
  }
};
