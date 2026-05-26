from __future__ import annotations

import chromadb
from chromadb.config import Settings as ChromaSettings

from config import settings

COLLECTION_NAME = "crogo_kb"

_client: chromadb.PersistentClient | None = None


def get_client() -> chromadb.PersistentClient:
    global _client
    if _client is None:
        _client = chromadb.PersistentClient(
            path=str(settings.chroma_dir),
            settings=ChromaSettings(anonymized_telemetry=False),
        )
    return _client


def get_collection():
    client = get_client()
    return client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


def add_chunks(
    chunks: list[str],
    metadatas: list[dict],
    ids: list[str],
) -> None:
    if not chunks:
        return
    col = get_collection()
    col.add(documents=chunks, metadatas=metadatas, ids=ids)


def count_chunks() -> int:
    col = get_collection()
    return col.count()


def search(query: str, top_k: int | None = None) -> list[dict]:
    k = top_k or settings.kb_top_k
    col = get_collection()
    if col.count() == 0:
        return []
    result = col.query(query_texts=[query], n_results=min(k, col.count()))
    out: list[dict] = []
    docs = result.get("documents") or [[]]
    metas = result.get("metadatas") or [[]]
    dists = result.get("distances") or [[]]
    for doc, meta, dist in zip(docs[0], metas[0], dists[0]):
        score = max(0.0, 1.0 - (dist or 0.0))
        out.append(
            {
                "text": doc,
                "source": (meta or {}).get("source", ""),
                "score": round(score, 3),
            }
        )
    return out
