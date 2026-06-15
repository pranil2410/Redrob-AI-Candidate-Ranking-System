#!/usr/bin/env python3
"""
Candidate and Job Description Parser
"""

import json
import os

def stream_candidates(filepath):
    """
    Streams candidates from a JSONL or JSON file.
    Yields candidate dictionary objects one-by-one.
    """
    if filepath.endswith(".jsonl"):
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    yield json.loads(line)
    else:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                for item in data:
                    yield item
            else:
                yield data

def get_job_description():
    """
    Returns the target job description text.
    """
    return (
        "Senior AI Engineer, Founding Team. Production experience with embeddings-based "
        "retrieval systems (sentence-transformers, OpenAI embeddings, BGE, E5, dense retrieval, "
        "vector search, semantic search), vector databases or hybrid search infrastructure "
        "(Pinecone, Weaviate, Qdrant, Milvus, OpenSearch, Elasticsearch, FAISS), strong Python, "
        "evaluation frameworks for ranking systems (NDCG, MRR, MAP, A/B testing). "
        "Applied ML/AI models shipped to production."
    )
