from decimal import Decimal

from django.db.models import Case, DecimalField, F, Sum, When

from core.registry import accion
from core.services import CrudService

from .models import Categoria, Cuenta, Movimiento, Proveedor


class CuentaService(CrudService):
    model = Cuenta

    @classmethod
    def saldo(cls, usuario, pk) -> Decimal:
        """Saldo actual. Una tarjeta vinculada comparte el saldo de su cuenta madre, y la
        cuenta madre descuenta también los movimientos hechos con sus tarjetas."""
        cuenta = cls.obtener(usuario, pk)
        if cuenta.cuenta_madre_id:
            cuenta = cls.obtener(usuario, cuenta.cuenta_madre_id)
        ids = [cuenta.pk, *cuenta.tarjetas.values_list("pk", flat=True)]
        neto = Movimiento.objects.filter(cuenta_id__in=ids).aggregate(
            total=Sum(
                Case(
                    When(tipo=Movimiento.Tipo.INGRESO, then=F("monto")),
                    default=-F("monto"),
                    output_field=DecimalField(),
                )
            )
        )["total"] or Decimal("0")
        return cuenta.saldo_inicial + neto

class CategoriaService(CrudService):
    model = Categoria


class MovimientoService(CrudService):
    model = Movimiento

    @classmethod
    def listar(cls, usuario, **filtros):
        return super().listar(usuario, **filtros).select_related("cuenta", "categoria")


@accion("finanzas.crear_movimiento", "Registra un ingreso o gasto en una cuenta")
def crear_movimiento(usuario, **datos):
    return MovimientoService.crear(usuario, **datos)


@accion("finanzas.eliminar_movimiento", "Elimina un movimiento")
def eliminar_movimiento(usuario, pk):
    return MovimientoService.eliminar(usuario, pk)


@accion("finanzas.saldo_cuenta", "Consulta el saldo actual de una cuenta")
def saldo_cuenta(usuario, pk):
    return CuentaService.saldo(usuario, pk)


class ProveedorService(CrudService):
    model = Proveedor
