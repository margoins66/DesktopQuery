from fastapi import APIRouter

from ..config import COMPARISON_TOPICS, RISK_CATEGORIES, SUMMARY_STYLES
from ..models import ComparisonRequest, RiskRequest, SummaryRequest
from ..rag.comparisons import compare_documents
from ..rag.risk import analyze_risk
from ..rag.summaries import generate_summary

router = APIRouter(tags=["analysis"])


@router.get("/summaries/styles")
def summary_styles():
    return [{"key": k, "label": v} for k, v in SUMMARY_STYLES.items()]


@router.post("/summaries")
def create_summary(req: SummaryRequest):
    return generate_summary(req.document_id, req.style)


@router.get("/comparisons/topics")
def comparison_topics():
    return {"topics": COMPARISON_TOPICS}


@router.post("/comparisons")
def create_comparison(req: ComparisonRequest):
    return compare_documents(req.document_ids, req.topics)


@router.get("/risk/categories")
def risk_categories():
    return {"categories": RISK_CATEGORIES}


@router.post("/risk")
def create_risk(req: RiskRequest):
    return analyze_risk(req.document_id)
