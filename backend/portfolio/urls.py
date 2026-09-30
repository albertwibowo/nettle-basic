from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import ClientViewSet, ClientFieldDefinitionViewSet

router = DefaultRouter()
router.register("clients", ClientViewSet, basename="client")
router.register(
    "client-fields",
    ClientFieldDefinitionViewSet,
    basename="client-field",
)

urlpatterns = [
    path("", include(router.urls)),
]
