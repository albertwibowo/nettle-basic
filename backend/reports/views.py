import json
from django.db.models import Count
from django.http import StreamingHttpResponse
from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from openrouter import OpenRouter

from .models import Report, ReportTemplate, ReportTemplateVersion
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
        Generate report content using AI. Streams the response back to the
        client via Server-Sent Events so the user can see it being written
        in real time.

        This is a synchronous, blocking operation — the user must keep the
        tab open until generation completes.
        """
        report = self.get_object()
        assessment = report.assessment

        # Gather all evidence for this assessment
        evidence_items = Evidence.objects.filter(assessment=assessment)

        if not evidence_items.exists():
            return Response(
                {"error": "No evidence found for this assessment."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Build the prompt with all evidence
        evidence_context = _build_evidence_context(evidence_items)

        prompt = f"""You are a risk engineering report writer. Based on the following 
evidence collected during a site inspection, generate a comprehensive risk 
assessment report.

Client: {assessment.client.name}
Site: {assessment.site_address or 'Not specified'}
Assessment: {assessment.title}

Evidence collected:
{evidence_context}

Write a detailed risk engineering report covering:
1. Executive Summary
2. Site Overview
3. Key Risk Findings
4. Fire Protection Assessment
5. Structural Assessment
6. Electrical Systems Assessment
7. Recommendations
8. Risk Rating

Be specific and reference the evidence provided. Use a professional tone 
appropriate for insurance underwriters."""

        report.status = "generating"
        report.save()

        def stream_response():
            """Stream AI response as Server-Sent Events."""
            full_content = ""

            try:
                with OpenRouter(api_key=settings.OPENROUTER_API_KEY) as client:
                    with client.chat.send(
                        model="inception/mercury-2.5",
                        max_tokens=4096,
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

                # Save completed report
                report.content = full_content
                report.title = f"Risk Report - {assessment.client.name}"
                report.status = "completed"
                report.save()

                yield f"data: {json.dumps({'type': 'done', 'report_id': str(report.id)})}\n\n"

            except Exception as e:
                report.status = "failed"
                report.save()
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

        response = StreamingHttpResponse(
            stream_response(), content_type="text/event-stream"
        )
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response


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
