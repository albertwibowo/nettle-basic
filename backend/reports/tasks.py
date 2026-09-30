"""Celery tasks for asynchronous report generation."""

from celery import shared_task

from .generation import run_report_generation


@shared_task(bind=True, max_retries=2)
def generate_report_task(self, report_id: str):
    """
    Run non-streaming OpenRouter generation for a report.

    The HTTP kickoff already pinned a template and created answer rows with
    status=generating. This task completes or fails the report.
    """
    run_report_generation(report_id)
