from django.db import transaction
from django.db.models import Max
from rest_framework import serializers

from .models import (
    Report,
    ReportAnswer,
    ReportQuestion,
    ReportSection,
    ReportTemplate,
    ReportTemplateVersion,
)


# ---------------------------------------------------------------------------
# Template serializers
# ---------------------------------------------------------------------------


class ReportTemplateSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(
        source="client.name", read_only=True, default=None
    )

    class Meta:
        model = ReportTemplate
        fields = [
            "id",
            "name",
            "description",
            "client",
            "client_name",
            "is_default",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "client_name", "created_at", "updated_at"]

    def validate(self, attrs):
        # Portfolio templates are never the global default.
        client = attrs.get("client", getattr(self.instance, "client", None))
        is_default = attrs.get(
            "is_default", getattr(self.instance, "is_default", False)
        )
        if client is not None and is_default:
            raise serializers.ValidationError(
                {"is_default": "Only the global template may be marked as default."}
            )
        return attrs


class ReportTemplateListSerializer(serializers.ModelSerializer):
    version_count = serializers.SerializerMethodField()
    client_name = serializers.CharField(
        source="client.name", read_only=True, default=None
    )

    class Meta:
        model = ReportTemplate
        fields = [
            "id",
            "name",
            "description",
            "client",
            "client_name",
            "is_default",
            "version_count",
            "created_at",
            "updated_at",
        ]

    def get_version_count(self, obj):
        # Prefer annotation when present; fall back to prefetched/related count.
        if hasattr(obj, "annotated_version_count"):
            return obj.annotated_version_count
        return obj.versions.count()


# ---------------------------------------------------------------------------
# Nested question / section serializers (read)
# ---------------------------------------------------------------------------


class ReportQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportQuestion
        fields = ["id", "prompt", "guidance", "order"]
        read_only_fields = fields


class ReportSectionSerializer(serializers.ModelSerializer):
    questions = ReportQuestionSerializer(many=True, read_only=True)

    class Meta:
        model = ReportSection
        fields = ["id", "title", "instructions", "order", "questions"]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Version serializers
# ---------------------------------------------------------------------------


class ReportTemplateVersionListSerializer(serializers.ModelSerializer):
    section_count = serializers.SerializerMethodField()

    class Meta:
        model = ReportTemplateVersion
        fields = ["id", "template", "version_number", "section_count", "created_at"]
        read_only_fields = fields

    def get_section_count(self, obj):
        if hasattr(obj, "annotated_section_count"):
            return obj.annotated_section_count
        return obj.sections.count()


class ReportTemplateVersionDetailSerializer(serializers.ModelSerializer):
    sections = ReportSectionSerializer(many=True, read_only=True)

    class Meta:
        model = ReportTemplateVersion
        fields = ["id", "template", "version_number", "sections", "created_at"]
        read_only_fields = fields


class ReportQuestionCreateSerializer(serializers.Serializer):
    prompt = serializers.CharField()
    guidance = serializers.CharField(required=False, allow_blank=True, default="")
    order = serializers.IntegerField(required=False, default=0)


class ReportSectionCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255)
    instructions = serializers.CharField(required=False, allow_blank=True, default="")
    order = serializers.IntegerField(required=False, default=0)
    questions = ReportQuestionCreateSerializer(many=True)

    def validate_questions(self, value):
        if not value:
            raise serializers.ValidationError(
                "Each section must include at least one question."
            )
        return value


class ReportTemplateVersionCreateSerializer(serializers.Serializer):
    """
    Create an immutable template version with nested sections and questions.
    `version_number` is assigned automatically (max existing + 1).
    """

    sections = ReportSectionCreateSerializer(many=True)

    def validate_sections(self, value):
        if not value:
            raise serializers.ValidationError(
                "A version must include at least one section."
            )
        return value

    @transaction.atomic
    def create(self, validated_data):
        template = validated_data.pop("template")
        sections_data = validated_data.pop("sections")

        max_version = (
            template.versions.aggregate(Max("version_number"))["version_number__max"]
            or 0
        )
        version = ReportTemplateVersion.objects.create(
            template=template,
            version_number=max_version + 1,
        )

        for section_data in sections_data:
            questions_data = section_data.pop("questions")
            section = ReportSection.objects.create(
                template_version=version,
                **section_data,
            )
            ReportQuestion.objects.bulk_create(
                [
                    ReportQuestion(section=section, **question_data)
                    for question_data in questions_data
                ]
            )

        return version


# ---------------------------------------------------------------------------
# Report answer / structured detail serializers
# ---------------------------------------------------------------------------


class ReportAnswerSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportAnswer
        fields = ["id", "content", "status"]
        read_only_fields = fields


class ReportQuestionWithAnswerSerializer(serializers.ModelSerializer):
    answer = serializers.SerializerMethodField()

    class Meta:
        model = ReportQuestion
        fields = ["id", "prompt", "guidance", "order", "answer"]
        read_only_fields = fields

    def get_answer(self, question):
        answers_by_question = self.context.get("answers_by_question", {})
        answer = answers_by_question.get(question.id)
        if answer is None:
            return None
        return ReportAnswerSerializer(answer).data


class ReportSectionWithAnswersSerializer(serializers.ModelSerializer):
    questions = ReportQuestionWithAnswerSerializer(many=True, read_only=True)

    class Meta:
        model = ReportSection
        fields = ["id", "title", "instructions", "order", "questions"]
        read_only_fields = fields


class ReportSerializer(serializers.ModelSerializer):
    assessment_title = serializers.CharField(
        source="assessment.title", read_only=True
    )
    sections = serializers.SerializerMethodField()

    class Meta:
        model = Report
        fields = [
            "id",
            "assessment",
            "assessment_title",
            "template_version",
            "title",
            "content",
            "status",
            "sections",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "assessment_title", "sections", "created_at", "updated_at"]

    def validate(self, attrs):
        assessment = attrs.get("assessment") or getattr(self.instance, "assessment", None)
        template_version = attrs.get("template_version")
        if template_version is None and "template_version" not in attrs:
            template_version = getattr(self.instance, "template_version", None)

        if assessment is not None and template_version is not None:
            template = template_version.template
            same_portfolio = (
                template.client_id is not None
                and template.client_id == assessment.client_id
            )
            is_global_default = template.client_id is None and template.is_default
            if not same_portfolio and not is_global_default:
                raise serializers.ValidationError(
                    {
                        "template_version": (
                            "Template must belong to the same portfolio as "
                            "the assessment, or be the global default."
                        )
                    }
                )
        return attrs

    def get_sections(self, report):
        """Return answers grouped by section from the pinned template version."""
        if not report.template_version_id:
            return []

        answers_by_question = {
            answer.question_id: answer for answer in report.answers.all()
        }
        sections = report.template_version.sections.prefetch_related("questions").all()
        return ReportSectionWithAnswersSerializer(
            sections,
            many=True,
            context={"answers_by_question": answers_by_question},
        ).data


class ReportListSerializer(serializers.ModelSerializer):
    assessment_title = serializers.CharField(
        source="assessment.title", read_only=True
    )

    class Meta:
        model = Report
        fields = [
            "id",
            "assessment",
            "assessment_title",
            "template_version",
            "title",
            "status",
            "created_at",
        ]
