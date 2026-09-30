import uuid

from django.db import models


class Notification(models.Model):
    """
    Global in-app notification (no user FK — this app has no auth).
    Optionally linked to a Report for deep-linking in the UI.
    """

    EVENT_TYPES = [
        ("report.completed", "Report Completed"),
        ("report.failed", "Report Failed"),
        ("report.generation_started", "Report Generation Started"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    report = models.ForeignKey(
        "reports.Report",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifications",
    )
    event_type = models.CharField(max_length=64, choices=EVENT_TYPES)
    title = models.CharField(max_length=255)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.event_type}: {self.title}"
