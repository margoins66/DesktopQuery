from fastapi import APIRouter
from fastapi.responses import Response

from ..exports import export_answer_docx, export_comparison_xlsx, export_summary_pdf
from ..models import ComparisonRequest, ExportAnswerRequest, SummaryRequest
from ..rag.comparisons import compare_documents
from ..rag.summaries import generate_summary

router = APIRouter(prefix="/exports", tags=["exports"])


@router.post("/answer")
def export_answer(req: ExportAnswerRequest):
    data = export_answer_docx(
        req.question, req.answer, [c.model_dump() for c in req.citations]
    )
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": "attachment; filename=answer.docx"},
    )


@router.post("/comparison")
def export_comparison(req: ComparisonRequest):
    comparison = compare_documents(req.document_ids, req.topics)
    data = export_comparison_xlsx(comparison)
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=comparison.xlsx"},
    )


@router.post("/summary")
def export_summary(req: SummaryRequest):
    result = generate_summary(req.document_id, req.style)
    title = f"{result.get('style_label', 'Summary')}"
    data = export_summary_pdf(title, result["summary"], result.get("citations", []))
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=summary.pdf"},
    )
