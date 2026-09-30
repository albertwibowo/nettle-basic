from rest_framework import viewsets

from .models import Client, ClientFieldDefinition
from .serializers import (
    ClientSerializer,
    ClientListSerializer,
    ClientFieldDefinitionSerializer,
)


class ClientViewSet(viewsets.ModelViewSet):
    queryset = Client.objects.all()

    def get_serializer_class(self):
        if self.action == "list":
            return ClientListSerializer
        return ClientSerializer


class ClientFieldDefinitionViewSet(viewsets.ModelViewSet):
    """
    CRUD for client field schema definitions.

    List returns all definitions (including disabled), ordered by group/order.
    Destroy removes the definition only; orphaned Client.attributes keys remain.
    """

    queryset = ClientFieldDefinition.objects.all()
    serializer_class = ClientFieldDefinitionSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
