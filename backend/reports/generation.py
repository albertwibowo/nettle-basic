"""
Non-streaming AI report generation used by the Celery worker.

The HTTP generate endpoint only validates, pins a template, creates answer
rows, and enqueues work. Persistence of model output happens here.
"""

import json

from django.conf import settings
from openrouter import OpenRouter
from openrouter.components import (
    ChatFormatJSONSchemaConfig,
    ChatJSONSchemaConfig,
    ProviderPreferences,
)

from evidence.models import Evidence

from .models import Report

# JSON Schema enforced via OpenRouter structured outputs for report generation.
REPORT_ANSWERS_SCHEMA = {
    "type": "object",
    "properties": {
        "answers": {
            "type": "array",
            "description": (
                "One entry per template question. Include every question_id "
                "from the prompt exactly once."
            ),
            "items": {
                "type": "object",
                "properties": {
                    "question_id": {
                        "type": "string",
                        "description": "UUID of the template question being answered.",
                    },
                    "content": {
                        "type": "string",
                        "description": (
                            "Professional risk-engineering answer. Use an empty "
                            "string only if the evidence is insufficient."
                        ),
                    },
                },
                "required": ["question_id", "content"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["answers"],
    "additionalProperties": False,
}

REPORT_ANSWERS_RESPONSE_FORMAT = ChatFormatJSONSchemaConfig(
    type="json_schema",
    json_schema=ChatJSONSchemaConfig(
        name="report_answers",
        strict=True,
        schema_=REPORT_ANSWERS_SCHEMA,
    ),
)

# Only route to providers that honor response_format / structured outputs.
STRUCTURED_OUTPUT_PROVIDER = ProviderPreferences(require_parameters=True)


def run_report_generation(report_id: str) -> None:
    """
    Call OpenRouter (non-streaming), parse structured JSON, and persist
    ReportAnswer rows + report markdown cache.

    On failure, marks the report and its answers as failed, then re-raises.
    """
    report = (
        Report.objects.select_related("assessment__client", "template_version")
        .prefetch_related("template_version__sections__questions", "answers")
        .get(pk=report_id)
    )
    assessment = report.assessment
    template_version = report.template_version
    if template_version is None:
        _mark_generation_failed(report)
        raise ValueError("Report has no pinned template version.")

    sections = list(template_version.sections.prefetch_related("questions").all())
    evidence_items = Evidence.objects.filter(assessment=assessment)
    evidence_context = build_evidence_context(evidence_items)
    prompt = build_generation_prompt(
        assessment=assessment,
        evidence_context=evidence_context,
        sections=sections,
    )

    try:
        with OpenRouter(api_key=settings.OPENROUTER_API_KEY) as client:
            result = client.chat.send(
                model="inception/mercury-2.5",
                max_tokens=8192,
                messages=[{"role": "user", "content": prompt}],
                response_format=REPORT_ANSWERS_RESPONSE_FORMAT,
                provider=STRUCTURED_OUTPUT_PROVIDER,
                stream=False,
            )

        full_content = _extract_message_content(result)
        parsed = parse_answers_json(full_content)
        answers_by_question_id = {
            entry["question_id"]: entry["content"] for entry in parsed["answers"]
        }

        answer_rows = list(report.answers.select_related("question__section").all())
        for answer in answer_rows:
            qid = str(answer.question_id)
            if qid in answers_by_question_id:
                answer.content = answers_by_question_id[qid] or ""
                answer.status = "completed"
            else:
                answer.content = ""
                answer.status = "failed"
            answer.save(update_fields=["content", "status"])

        report.content = build_markdown_content(sections, answer_rows)
        report.status = "completed"
        report.save(update_fields=["content", "status", "updated_at"])

    except Exception:
        _mark_generation_failed(report)
        raise


def _mark_generation_failed(report: Report) -> None:
    report.answers.update(status="failed")
    report.status = "failed"
    report.save(update_fields=["status", "updated_at"])


def _extract_message_content(result) -> str:
    """Pull assistant text content from a non-streaming ChatResult."""
    if not result.choices:
        raise ValueError("Model returned no choices.")
    content = result.choices[0].message.content
    if not isinstance(content, str):
        raise ValueError("Model returned empty or non-text content.")
    return content


def build_generation_prompt(assessment, evidence_context, sections):
    """Build a single prompt that asks for JSON answers for every question."""
    outline_parts = []
    for section in sections:
        outline_parts.append(
            f"## Section: {section.title}\n"
            f"Instructions: {section.instructions or '(none)'}"
        )
        for question in section.questions.all():
            guidance = question.guidance or "(none)"
            outline_parts.append(
                f"- question_id: {question.id}\n"
                f"  prompt: {question.prompt}\n"
                f"  guidance: {guidance}"
            )

    outline = "\n\n".join(outline_parts)

    return f"""You are a risk engineering report writer. Based on the following
evidence collected during a site inspection, answer every question in the
report template below.

Client: {assessment.client.name}
Site: {assessment.site_address or 'Not specified'}
Assessment: {assessment.title}

Evidence collected:
{evidence_context}

Report template:
{outline}

Respond using the enforced JSON schema (answers array of question_id + content).

Rules:
- Include every question_id from the template exactly once.
- Write specific, professional answers suitable for insurance underwriters.
- Reference the evidence where relevant.
- content must be a string (use empty string only if truly unknown)."""


def parse_answers_json(raw_text):
    """
    Parse structured-output JSON into a dict with an `answers` list.

    OpenRouter enforces the schema via response_format; this validates the
    payload before persisting answers.
    """
    text = (raw_text or "").strip()
    if not text:
        raise ValueError("Model returned an empty response.")

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError("Model response was not valid JSON.") from exc

    if not isinstance(data, dict) or "answers" not in data:
        raise ValueError("Model JSON must contain an 'answers' array.")
    if not isinstance(data["answers"], list):
        raise ValueError("Model JSON 'answers' must be a list.")

    for entry in data["answers"]:
        if not isinstance(entry, dict):
            raise ValueError("Each answer must be an object.")
        if "question_id" not in entry or "content" not in entry:
            raise ValueError("Each answer must include question_id and content.")
        if not isinstance(entry["question_id"], str) or not isinstance(
            entry["content"], str
        ):
            raise ValueError("question_id and content must be strings.")

    return data


def build_markdown_content(sections, answer_rows):
    """Concatenate completed answers into a markdown cache for report.content."""
    answers_by_question = {row.question_id: row for row in answer_rows}
    parts = []

    for section in sections:
        parts.append(f"## {section.title}")
        for question in section.questions.all():
            answer = answers_by_question.get(question.id)
            content = (answer.content if answer else "").strip()
            parts.append(f"### {question.prompt}")
            parts.append(content or "_No answer_")
        parts.append("")

    return "\n\n".join(parts).strip()


def build_evidence_context(evidence_items):
    """Build a text context from all evidence items for the AI prompt."""
    context_parts = []

    for item in evidence_items:
        if item.evidence_type == "note":
            context_parts.append(f"[Note] {item.title}: {item.text_content}")

        elif item.evidence_type == "document":
            if item.text_content:
                context_parts.append(
                    f"[Document] {item.title}: {item.text_content}"
                )
            elif item.file:
                context_parts.append(
                    f"[Document] {item.title}: (file uploaded: {item.file.name})"
                )

        elif item.evidence_type == "image":
            desc = item.description or item.title or "No description"
            context_parts.append(f"[Photo] {desc}")

    return "\n".join(context_parts)
