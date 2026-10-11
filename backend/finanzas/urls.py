from rest_framework.routers import DefaultRouter

from .api import CategoriaViewSet, CuentaViewSet, MovimientoViewSet, ProveedorViewSet

router = DefaultRouter()
router.register("cuentas", CuentaViewSet, basename="cuenta")
router.register("categorias", CategoriaViewSet, basename="categoria")
router.register("movimientos", MovimientoViewSet, basename="movimiento")
router.register("proveedores", ProveedorViewSet, basename="proveedor")

urlpatterns = router.urls
