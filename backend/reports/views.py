from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

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
from .tasks import generate_report_task
from evidence.models import Evidence


class ReportTemplateViewSet(viewsets.ModelViewSet):
    """
    CRUD for report template metadata.

    Nested versions:
      GET/POST    /api/report-templates/:id/versions/
      GET/DELETE  /api/report-templates/:id/versions/:version_id/
    """

    queryset = ReportTemplate.objects.select_related("client").all()
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
        # Templates usable when generating: same portfolio + global default.
        for_client = self.request.query_params.get("for_client")
        if for_client:
            qs = qs.filter(
                Q(client_id=for_client) | Q(is_default=True, client__isnull=True)
            )
        is_default = self.request.query_params.get("is_default")
        if is_default is not None:
            qs = qs.filter(is_default=is_default.lower() in ("1", "true", "yes"))
        return qs

    def destroy(self, request, *args, **kwargs):
        template = self.get_object()
        if template.is_default and template.client_id is None:
            return Response(
                {
                    "error": "The global default template cannot be deleted. "
                    "Create and manage portfolio-specific templates instead."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

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
        methods=["get", "delete"],
        url_path=r"versions/(?P<version_id>[^/.]+)",
    )
    def version_detail(self, request, pk=None, version_id=None):
        template = self.get_object()
        version = get_object_or_404(
            ReportTemplateVersion.objects.prefetch_related("sections__questions"),
            pk=version_id,
            template=template,
        )

        if request.method == "DELETE":
            version.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

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
        Kick off asynchronous report generation. Resolves and pins a template
        version, creates answer rows for every question, enqueues a Celery
        task, and returns 202 with the updated report.

        Optional JSON body:
          - template_version: UUID of a specific version to pin
          - template: UUID of a template (uses its latest version)
        Explicit body values override any previously pinned version.
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
            template_version = _resolve_template_version(
                report,
                assessment,
                template_id=request.data.get("template"),
                template_version_id=request.data.get("template_version"),
            )
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
            # Lock the row so concurrent generate requests cannot both enqueue.
            report = Report.objects.select_for_update().get(pk=report.pk)
            if report.status == "generating":
                return Response(
                    {"error": "Report generation is already in progress."},
                    status=status.HTTP_409_CONFLICT,
                )

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

        generate_report_task.delay(str(report.id))

        report.refresh_from_db()
        return Response(
            ReportSerializer(report).data,
            status=status.HTTP_202_ACCEPTED,
        )


class TemplateResolutionError(Exception):
    """Raised when no suitable template version can be resolved for a report."""


def _latest_version_for_template(template):
    """Return the latest version of a template, or None."""
    return (
        template.versions.order_by("-version_number")
        .prefetch_related("sections__questions")
        .first()
    )


def _template_allowed_for_assessment(template, client):
    """
    True when the template may be used for this assessment:
    linked to the same portfolio, or the global default.
    """
    if template.client_id is not None:
        return template.client_id == client.id
    return template.is_default


def _assert_version_allowed_for_assessment(version, client):
    """Raise if the version's template is not allowed for this assessment."""
    template = version.template
    if not _template_allowed_for_assessment(template, client):
        raise TemplateResolutionError(
            "Selected template must belong to this assessment's portfolio "
            "or be the global default."
        )
    return version


def _resolve_template_version(
    report,
    assessment,
    template_id=None,
    template_version_id=None,
):
    """
    Return the template version to use for generation.

    Selected templates/versions must belong to the assessment's portfolio
    or be the global default (other portfolios are rejected).

    Resolution order:
      1. Explicit template_version_id from the request
      2. Latest version of an explicit template_id from the request
      3. Already-pinned report.template_version
      4. Latest version of a portfolio-specific template
      5. Latest version of the global default template
      6. Raise TemplateResolutionError
    """
    client = assessment.client

    if template_version_id:
        try:
            version = ReportTemplateVersion.objects.select_related(
                "template"
            ).prefetch_related("sections__questions").get(pk=template_version_id)
        except ReportTemplateVersion.DoesNotExist as exc:
            raise TemplateResolutionError(
                "Selected template version was not found."
            ) from exc
        return _assert_version_allowed_for_assessment(version, client)

    if template_id:
        try:
            template = ReportTemplate.objects.get(pk=template_id)
        except ReportTemplate.DoesNotExist as exc:
            raise TemplateResolutionError(
                "Selected template was not found."
            ) from exc
        if not _template_allowed_for_assessment(template, client):
            raise TemplateResolutionError(
                "Selected template must belong to this assessment's portfolio "
                "or be the global default."
            )
        version = _latest_version_for_template(template)
        if version:
            return version
        raise TemplateResolutionError(
            f"Template '{template.name}' has no versions yet."
        )

    if report.template_version_id:
        version = ReportTemplateVersion.objects.select_related(
            "template"
        ).prefetch_related("sections__questions").get(pk=report.template_version_id)
        return _assert_version_allowed_for_assessment(version, client)

    client_template = (
        ReportTemplate.objects.filter(client=client)
        .order_by("-updated_at", "-created_at")
        .first()
    )
    if client_template:
        client_version = _latest_version_for_template(client_template)
        if client_version:
            return client_version

    default_template = ReportTemplate.objects.filter(
        is_default=True,
        client__isnull=True,
    ).first()
    if default_template:
        default_version = _latest_version_for_template(default_template)
        if default_version:
            return default_version

    raise TemplateResolutionError(
        "No template version available. Create a portfolio template or a "
        "global default template before generating."
    )

