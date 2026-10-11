from django.urls import path
from rest_framework.routers import DefaultRouter

from .api import NotificacionViewSet, suscribir, vapid_public_key

router = DefaultRouter()
router.register("", NotificacionViewSet, basename="notificacion")

urlpatterns = [
    path("vapid-public-key/", vapid_public_key),
    path("suscribir/", suscribir),
] + router.urls
