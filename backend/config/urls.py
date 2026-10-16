from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from core.api import me
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/token/", TokenObtainPairView.as_view(), name="token_obtain"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/me/", me, name="me"),
    path("api/finanzas/", include("finanzas.urls")),
    path("api/agenda/", include("agenda.urls")),
    path("api/notas/", include("notas.urls")),
    path("api/notificaciones/", include("notificaciones.urls")),
    path("api/chat/", include("chat.urls")),
    path("api/correos/", include("correos.urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
