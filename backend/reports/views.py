import json
import re
from django.db import transaction
from django.db.models import Count
from django.http import StreamingHttpResponse
from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from openrouter import OpenRouter

from .models import (
    Report,
    ReportAnswer,
    ReportTemplate,
    ReportTemplateVersion,
)
from .serializers import (
    ReportSerializer,
    ReportListSerializer,
    ReportTemplateSerializer,
    ReportTemplateListSerializer,
    ReportTemplateVersionListSerializer,
    ReportTemplateVersionDetailSerializer,
    ReportTemplateVersionCreateSerializer,
)
from evidence.models import Evidence


class ReportTemplateViewSet(viewsets.ModelViewSet):
    """
    CRUD for report template metadata.

    Nested versions:
      GET/POST  /api/report-templates/:id/versions/
      GET       /api/report-templates/:id/versions/:version_id/
    """

    queryset = ReportTemplate.objects.all()
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_serializer_class(self):
        if self.action == "list":
            return ReportTemplateListSerializer
        return ReportTemplateSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action == "list":
            qs = qs.annotate(annotated_version_count=Count("versions"))
        client_id = self.request.query_params.get("client")
        if client_id:
            qs = qs.filter(client_id=client_id)
        is_default = self.request.query_params.get("is_default")
        if is_default is not None:
            qs = qs.filter(is_default=is_default.lower() in ("1", "true", "yes"))
        return qs

    @action(detail=True, methods=["get", "post"], url_path="versions")
    def versions(self, request, pk=None):
        template = self.get_object()

        if request.method == "GET":
            versions = template.versions.annotate(
                annotated_section_count=Count("sections")
            )
            serializer = ReportTemplateVersionListSerializer(versions, many=True)
            return Response(serializer.data)

        serializer = ReportTemplateVersionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        version = serializer.save(template=template)
        # Re-fetch with nested sections/questions for the detail response.
        version = ReportTemplateVersion.objects.prefetch_related(
            "sections__questions"
        ).get(pk=version.pk)
        return Response(
            ReportTemplateVersionDetailSerializer(version).data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=["get"],
        url_path=r"versions/(?P<version_id>[^/.]+)",
    )
    def version_detail(self, request, pk=None, version_id=None):
        template = self.get_object()
        version = get_object_or_404(
            ReportTemplateVersion.objects.prefetch_related("sections__questions"),
            pk=version_id,
            template=template,
        )
        serializer = ReportTemplateVersionDetailSerializer(version)
        return Response(serializer.data)


class ReportViewSet(viewsets.ModelViewSet):
    queryset = Report.objects.select_related(
        "assessment", "template_version"
    ).prefetch_related(
        "answers",
        "template_version__sections__questions",
    ).all()

    def get_serializer_class(self):
        if self.action == "list":
            return ReportListSerializer
        return ReportSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        assessment_id = self.request.query_params.get("assessment")
        if assessment_id:
            qs = qs.filter(assessment_id=assessment_id)
        return qs

    @action(detail=True, methods=["post"])
    def generate(self, request, pk=None):
        """
        Generate report answers using a single AI call. Resolves and pins a
        template version, creates answer rows for every question, then streams
        the model response as SSE. On completion, parses structured JSON into
        ReportAnswer rows and caches concatenated markdown on report.content.
        """
        report = self.get_object()
        assessment = report.assessment

        evidence_items = Evidence.objects.filter(assessment=assessment)
        if not evidence_items.exists():
            return Response(
                {"error": "No evidence found for this assessment."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            template_version = _resolve_template_version(report, assessment)
        except TemplateResolutionError as exc:
            return Response(
                {"error": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        sections = list(
            template_version.sections.prefetch_related("questions").all()
        )
        questions = [
            question
            for section in sections
            for question in section.questions.all()
        ]
        if not questions:
            return Response(
                {"error": "Pinned template version has no questions."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            report.template_version = template_version
            report.status = "generating"
            if not report.title:
                report.title = f"Risk Report - {assessment.client.name}"
            report.save(
                update_fields=["template_version", "status", "title", "updated_at"]
            )

            # Replace any prior answers so regenerate is idempotent.
            report.answers.all().delete()
            ReportAnswer.objects.bulk_create(
                [
                    ReportAnswer(
                        report=report,
                        question=question,
                        status="pending",
                    )
                    for question in questions
                ]
            )
            report.answers.update(status="generating")

        evidence_context = _build_evidence_context(evidence_items)
        prompt = _build_generation_prompt(
            assessment=assessment,
            evidence_context=evidence_context,
            sections=sections,
        )

        def stream_response():
            full_content = ""

            try:
                with OpenRouter(api_key=settings.OPENROUTER_API_KEY) as client:
                    with client.chat.send(
                        model="inception/mercury-2.5",
                        max_tokens=8192,
                        messages=[{"role": "user", "content": prompt}],
                        stream=True,
                    ) as stream:
                        for event in stream:
                            if not event.choices:
                                continue
                            text = event.choices[0].delta.content
                            if text:
                                full_content += text
                                yield f"data: {json.dumps({'type': 'chunk', 'content': text})}\n\n"

                parsed = _parse_answers_json(full_content)
                answers_by_question_id = {
                    str(entry["question_id"]): entry.get("content", "")
                    for entry in parsed.get("answers", [])
                    if entry.get("question_id")
                }

                answer_rows = list(
                    report.answers.select_related("question__section").all()
                )
                for answer in answer_rows:
                    qid = str(answer.question_id)
                    if qid in answers_by_question_id:
                        answer.content = answers_by_question_id[qid] or ""
                        answer.status = "completed"
                    else:
                        answer.content = ""
                        answer.status = "failed"
                    answer.save(update_fields=["content", "status"])

                report.content = _build_markdown_content(sections, answer_rows)
                report.status = "completed"
                report.save(update_fields=["content", "status", "updated_at"])

                yield f"data: {json.dumps({'type': 'done', 'report_id': str(report.id)})}\n\n"

            except Exception as e:
                report.answers.update(status="failed")
                report.status = "failed"
                report.save(update_fields=["status", "updated_at"])
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

        response = StreamingHttpResponse(
            stream_response(), content_type="text/event-stream"
        )
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response


class TemplateResolutionError(Exception):
    """Raised when no suitable template version can be resolved for a report."""


def _resolve_template_version(report, assessment):
    """
    Return the template version to use for generation.

    Prefer an already-pinned version. Otherwise:
      1. Latest version of a client-specific template
      2. Latest version of the global default template
      3. Raise TemplateResolutionError
    """
    if report.template_version_id:
        return ReportTemplateVersion.objects.prefetch_related(
            "sections__questions"
        ).get(pk=report.template_version_id)

    client_template = (
        ReportTemplate.objects.filter(client=assessment.client)
        .order_by("-updated_at", "-created_at")
        .first()
    )
    if client_template:
        client_version = (
            client_template.versions.order_by("-version_number")
            .prefetch_related("sections__questions")
            .first()
        )
        if client_version:
            return client_version

    default_template = ReportTemplate.objects.filter(
        is_default=True,
        client__isnull=True,
    ).first()
    if default_template:
        default_version = (
            default_template.versions.order_by("-version_number")
            .prefetch_related("sections__questions")
            .first()
        )
        if default_version:
            return default_version

    raise TemplateResolutionError(
        "No template version available. Create a client template or a "
        "global default template before generating."
    )


def _build_generation_prompt(assessment, evidence_context, sections):
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

Return ONLY valid JSON (no markdown fences, no commentary) shaped exactly like:
{{
  "answers": [
    {{ "question_id": "<uuid>", "content": "..." }}
  ]
}}

Rules:
- Include every question_id from the template exactly once.
- Write specific, professional answers suitable for insurance underwriters.
- Reference the evidence where relevant.
- content must be a string (use empty string only if truly unknown)."""


def _parse_answers_json(raw_text):
    """
    Parse the model output into a dict with an `answers` list.
    Strips markdown code fences if the model wrapped the JSON.
    """
    text = (raw_text or "").strip()
    if not text:
        raise ValueError("Model returned an empty response.")

    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if fence_match:
        text = fence_match.group(1).strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # Attempt to extract the outermost JSON object if extra prose slipped in.
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ValueError("Model response was not valid JSON.")
        data = json.loads(text[start : end + 1])

    if not isinstance(data, dict) or "answers" not in data:
        raise ValueError("Model JSON must contain an 'answers' array.")
    if not isinstance(data["answers"], list):
        raise ValueError("Model JSON 'answers' must be a list.")

    return data


def _build_markdown_content(sections, answer_rows):
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


def _build_evidence_context(evidence_items):
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
