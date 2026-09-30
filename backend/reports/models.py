import uuid
from django.db import models
from assessments.models import Assessment
from portfolio.models import Client


class ReportTemplate(models.Model):
    """
    A named report template. Templates may be global (client=null) or
    client-specific. Exactly one global template is expected to be marked
    as the default.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    client = models.ForeignKey(
        Client,
        on_delete=models.CASCADE,
        related_name="report_templates",
        null=True,
        blank=True,
    )
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class ReportTemplateVersion(models.Model):
    """
    An immutable snapshot of a template's structure. New structure requires
    a new version; nested sections/questions are never patched in place.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    template = models.ForeignKey(
        ReportTemplate, on_delete=models.CASCADE, related_name="versions"
    )
    version_number = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-version_number"]
        unique_together = [("template", "version_number")]

    def __str__(self):
        return f"{self.template.name} v{self.version_number}"


class ReportSection(models.Model):
    """A section within a template version, containing ordered questions."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    template_version = models.ForeignKey(
        ReportTemplateVersion, on_delete=models.CASCADE, related_name="sections"
    )
    title = models.CharField(max_length=255)
    instructions = models.TextField(blank=True, default="")
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return self.title


class ReportQuestion(models.Model):
    """A question within a report section. Answers are stored as text."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    section = models.ForeignKey(
        ReportSection, on_delete=models.CASCADE, related_name="questions"
    )
    prompt = models.TextField()
    guidance = models.TextField(blank=True, default="")
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return self.prompt[:80]


class Report(models.Model):
    """
    A generated risk report for an assessment. Pins a specific template
    version so regenerating later never silently changes structure.
    `content` is a concatenated markdown cache; answers are the source of truth.
    """

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("generating", "Generating"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assessment = models.ForeignKey(
        Assessment, on_delete=models.CASCADE, related_name="reports"
    )
    template_version = models.ForeignKey(
        ReportTemplateVersion,
        on_delete=models.SET_NULL,
        related_name="reports",
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=255, blank=True, default="")
    content = models.TextField(blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Report: {self.title or self.assessment.title}"


class ReportAnswer(models.Model):
    """An answer to a specific question within a report."""

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("generating", "Generating"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    report = models.ForeignKey(
        Report, on_delete=models.CASCADE, related_name="answers"
    )
    question = models.ForeignKey(
        ReportQuestion, on_delete=models.CASCADE, related_name="answers"
    )
    content = models.TextField(blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")

    class Meta:
        unique_together = [("report", "question")]

    def __str__(self):
        return f"Answer to {self.question_id} for report {self.report_id}"
