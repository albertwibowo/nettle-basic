"""Notification channel abstraction.

Call sites should always go through ``get_notifier().notify(...)`` so switching
channel is a single env change (``NOTIFICATION_CHANNEL``).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional, Protocol

from django.conf import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class NotificationEvent:
    event_type: str
    title: str
    message: str
    report_id: Optional[str] = None


class Notifier(Protocol):
    def notify(self, event: NotificationEvent) -> None: ...


class InAppNotifier:
    """Persists notifications as ``Notification`` rows for in-app polling."""

    def notify(self, event: NotificationEvent) -> None:
        from .models import Notification

        Notification.objects.create(
            report_id=event.report_id,
            event_type=event.event_type,
            title=event.title,
            message=event.message,
        )


class WebhookNotifier:
    """Placeholder for outbound webhook delivery — not implemented."""

    def notify(self, event: NotificationEvent) -> None:
        logger.info(
            "WebhookNotifier not implemented; skipping event_type=%s report_id=%s",
            event.event_type,
            event.report_id,
        )


def get_notifier() -> Notifier:
    """Return the notifier for ``settings.NOTIFICATION_CHANNEL``."""
    if settings.NOTIFICATION_CHANNEL == "webhook":
        return WebhookNotifier()
    return InAppNotifier()
