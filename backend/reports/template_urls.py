from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import ReportTemplateViewSet

router = DefaultRouter()
router.register("", ReportTemplateViewSet, basename="report-template")

urlpatterns = [
    path("", include(router.urls)),
]
