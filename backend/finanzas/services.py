from decimal import Decimal

from django.db.models import Case, DecimalField, F, Sum, When

from core import crypto
from core.services import CrudService

from .models import Categoria, Cuenta, Movimiento, NotaSegura, Proveedor


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
        return super().listar(usuario, **filtros).select_related("cuenta", "categoria", "correo")


class ProveedorService(CrudService):
    model = Proveedor


def aad_nota(cuenta_id, dueno_id, campo: str) -> str:
    """Contexto autenticado del cifrado: liga cada valor a su cuenta, dueño y campo."""
    return f"notasegura:{cuenta_id}:{dueno_id}:{campo}"


class NotaSeguraService(CrudService):
    """Notas cifradas ancladas a una cuenta.

    SEGURIDAD: estas notas NO se registran con @accion a propósito: el futuro agente de IA
    no debe poder leer claves ni preguntas de seguridad.
    """

    model = NotaSegura

    @classmethod
    def _cifrar(cls, cuenta_id, dueno_id, titulo, contenido):
        return {
            "titulo_cifrado": crypto.cifrar(titulo, aad_nota(cuenta_id, dueno_id, "titulo")),
            "contenido_cifrado": crypto.cifrar(contenido, aad_nota(cuenta_id, dueno_id, "contenido")),
        }

    @classmethod
    def listar_por_cuenta(cls, actor, cuenta_id):
        CuentaService.obtener(actor, cuenta_id)  # comprueba que la cuenta es del usuario
        return cls.listar(actor, cuenta_id=cuenta_id)

    @classmethod
    def crear_nota(cls, actor, cuenta_id, titulo, contenido):
        cuenta = CuentaService.obtener(actor, cuenta_id)
        return cls.model.objects.create(
            cuenta=cuenta,
            creado_por=actor,
            actualizado_por=actor,
            **cls._cifrar(cuenta.pk, actor.pk, titulo, contenido),
        )

    @classmethod
    def actualizar_nota(cls, actor, pk, titulo=None, contenido=None):
        nota = cls.obtener(actor, pk)
        titulo = titulo if titulo is not None else cls.titulo(nota)
        contenido = contenido if contenido is not None else cls.contenido(nota)
        for campo, valor in cls._cifrar(nota.cuenta_id, nota.creado_por_id, titulo, contenido).items():
            setattr(nota, campo, valor)
        nota.actualizado_por = actor
        nota.save()
        return nota

    @classmethod
    def titulo(cls, nota) -> str:
        return crypto.descifrar(nota.titulo_cifrado, aad_nota(nota.cuenta_id, nota.creado_por_id, "titulo"))

    @classmethod
    def contenido(cls, nota) -> str:
        return crypto.descifrar(
            nota.contenido_cifrado, aad_nota(nota.cuenta_id, nota.creado_por_id, "contenido")
        )
