from rest_framework.routers import DefaultRouter

from .api import ConversacionViewSet

router = DefaultRouter()
router.register("conversaciones", ConversacionViewSet, basename="conversacion")

urlpatterns = router.urls
