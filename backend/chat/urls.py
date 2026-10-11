from django.urls import path
from rest_framework.routers import DefaultRouter

from .api import AccionPendienteViewSet, ConversacionViewSet, estado_ia

router = DefaultRouter()
router.register("conversaciones", ConversacionViewSet, basename="conversacion")
router.register("acciones", AccionPendienteViewSet, basename="accion")

urlpatterns = [path("estado/", estado_ia)] + router.urls
