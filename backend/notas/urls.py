from rest_framework.routers import DefaultRouter

from .api import NotaViewSet

router = DefaultRouter()
router.register("", NotaViewSet, basename="nota")

urlpatterns = router.urls
