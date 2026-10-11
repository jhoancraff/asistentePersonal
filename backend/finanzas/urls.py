from rest_framework.routers import DefaultRouter

from .api import (
    CategoriaViewSet,
    CuentaViewSet,
    MovimientoViewSet,
    NotaSeguraViewSet,
    ProveedorViewSet,
)

router = DefaultRouter()
router.register("cuentas", CuentaViewSet, basename="cuenta")
router.register("categorias", CategoriaViewSet, basename="categoria")
router.register("movimientos", MovimientoViewSet, basename="movimiento")
router.register("proveedores", ProveedorViewSet, basename="proveedor")
router.register("notas-seguras", NotaSeguraViewSet, basename="nota-segura")

urlpatterns = router.urls
