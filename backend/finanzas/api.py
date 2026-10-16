import re

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from django.core.exceptions import ObjectDoesNotExist
from rest_framework import status, viewsets
from rest_framework.exceptions import APIException, NotFound
from rest_framework.response import Response

from core.crypto import CifradoError, CifradoNoConfigurado
from rest_framework.exceptions import PermissionDenied
from rest_framework import serializers

from core.api import AuditSerializer, ServiceViewSet

from .models import Categoria, Cuenta, Movimiento, Proveedor
from .services import (
    CategoriaService,
    CuentaService,
    MovimientoService,
    NotaSeguraService,
    ProveedorService,
)
from .validators import validar_documento


class CuentaSerializer(AuditSerializer):
    saldo = serializers.SerializerMethodField()

    class Meta(AuditSerializer.Meta):
        model = Cuenta

    def get_saldo(self, obj):
        return CuentaService.saldo(obj.creado_por, obj.pk)

    def validate_moneda(self, valor):
        valor = valor.upper().strip()
        if not re.fullmatch(r"[A-Z0-9]{2,10}", valor):
            raise serializers.ValidationError("Código de moneda inválido (ej. VES, USD, USDT).")
        return valor

    def validate(self, attrs):
        # Cédula/RIF solo aplica a cuentas venezolanas (o sin país, como antes).
        pais = attrs.get("pais", getattr(self.instance, "pais", "")) or "VE"
        documento = attrs.get("documento", "")
        if documento and pais == "VE":
            try:
                attrs["documento"] = validar_documento(documento)
            except DjangoValidationError as exc:
                raise serializers.ValidationError({"documento": exc.messages})

        madre = attrs.get("cuenta_madre")
        if madre is not None:
            self._validar_madre(madre, attrs)
            attrs["saldo_inicial"] = 0  # el saldo vive en la cuenta madre
        return attrs

    def _validar_madre(self, madre, attrs):
        usuario = self.context["request"].user
        actual = self.instance
        moneda = attrs.get("moneda", getattr(actual, "moneda", None))
        error = None
        if madre.creado_por_id != usuario.id:
            error = "La cuenta madre no existe."
        elif actual is not None and madre.pk == actual.pk:
            error = "Una cuenta no puede ser su propia cuenta madre."
        elif madre.cuenta_madre_id:
            error = "La cuenta madre no puede ser a su vez una tarjeta vinculada."
        elif madre.tipo in ("debito", "credito", "tarjeta"):
            error = "Elige una cuenta, billetera o exchange como cuenta madre, no otra tarjeta."
        elif moneda and madre.moneda != moneda:
            error = f"La cuenta madre debe tener la misma moneda ({moneda})."
        elif actual is not None and actual.tarjetas.exists():
            error = "Esta cuenta ya tiene tarjetas vinculadas y no puede ser tarjeta."
        if error:
            raise serializers.ValidationError({"cuenta_madre": [error]})


class CategoriaSerializer(AuditSerializer):
    class Meta(AuditSerializer.Meta):
        model = Categoria


class MovimientoSerializer(AuditSerializer):
    # True si lo registró automáticamente una notificación del banco (módulo correos).
    automatico = serializers.SerializerMethodField()

    class Meta(AuditSerializer.Meta):
        model = Movimiento

    def get_automatico(self, movimiento):
        return hasattr(movimiento, "correo")


class CuentaViewSet(ServiceViewSet):
    service = CuentaService
    serializer_class = CuentaSerializer


class CategoriaViewSet(ServiceViewSet):
    service = CategoriaService
    serializer_class = CategoriaSerializer


class MovimientoViewSet(ServiceViewSet):
    service = MovimientoService
    serializer_class = MovimientoSerializer


class ProveedorSerializer(AuditSerializer):
    class Meta(AuditSerializer.Meta):
        model = Proveedor
        read_only_fields = AuditSerializer.Meta.read_only_fields + ("curado",)


class ProveedorViewSet(ServiceViewSet):
    """Catálogo compartido (solo lectura) + instituciones propias del usuario (CRUD)."""

    service = ProveedorService
    serializer_class = ProveedorSerializer

    def get_queryset(self):
        p = self.request.query_params
        qs = Proveedor.objects.filter(Q(creado_por__isnull=True) | Q(creado_por=self.request.user))
        if p.get("clase"):
            qs = qs.filter(clase=p["clase"])
        if p.get("pais"):
            filtro = Q(pais=p["pais"].upper())
            if p.get("incluir_globales") == "1":
                filtro |= Q(pais="")
            qs = qs.filter(filtro)
        if p.get("curado") == "1":
            qs = qs.filter(Q(curado=True) | Q(creado_por=self.request.user))
        if p.get("q"):
            qs = qs.filter(nombre__icontains=p["q"])
        return qs

    def _solo_propias(self, instance):
        if instance.creado_por_id != self.request.user.id:
            raise PermissionDenied("Las instituciones del catálogo no se pueden modificar.")

    def perform_update(self, serializer):
        self._solo_propias(serializer.instance)
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        self._solo_propias(instance)
        super().perform_destroy(instance)


class CifradoNoDisponible(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "El cifrado no está configurado en el servidor."
    default_code = "cifrado_no_disponible"


class NotaSeguraEntrada(serializers.Serializer):
    cuenta = serializers.IntegerField(required=False)
    titulo = serializers.CharField(max_length=120, trim_whitespace=True)
    contenido = serializers.CharField(max_length=5000, trim_whitespace=False)


class NotaSeguraEdicion(serializers.Serializer):
    titulo = serializers.CharField(max_length=120, trim_whitespace=True, required=False)
    contenido = serializers.CharField(max_length=5000, trim_whitespace=False, required=False)


def _meta(nota):
    return {
        "id": nota.id,
        "cuenta": nota.cuenta_id,
        "fecha_creacion": nota.fecha_creacion,
        "fecha_actualizacion": nota.fecha_actualizacion,
    }


@method_decorator(never_cache, name="dispatch")
class NotaSeguraViewSet(viewsets.ViewSet):
    """Notas cifradas por cuenta.

    - GET ?cuenta=ID  → solo ids y títulos (el contenido no viaja en el listado).
    - GET /{id}/      → título y contenido descifrados (se pide al "mostrar").
    Las respuestas llevan Cache-Control: no-store.
    """

    def _usuario(self):
        return self.request.user

    def _manejar(self, fn):
        try:
            return fn()
        except CifradoNoConfigurado as exc:
            raise CifradoNoDisponible() from exc
        except CifradoError as exc:
            raise APIException(
                "No se pudo descifrar la nota (¿cambió la clave de cifrado?)."
            ) from exc
        except ObjectDoesNotExist as exc:
            raise NotFound("La nota o la cuenta no existe.") from exc

    def list(self, request):
        cuenta = request.query_params.get("cuenta")
        if not cuenta or not cuenta.isdigit():
            return Response({"cuenta": ["Indica ?cuenta=ID."]}, status=400)

        def _hacer():
            notas = NotaSeguraService.listar_por_cuenta(self._usuario(), int(cuenta))
            return [{**_meta(n), "titulo": NotaSeguraService.titulo(n)} for n in notas]

        return Response(self._manejar(_hacer))

    def create(self, request):
        ser = NotaSeguraEntrada(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        if "cuenta" not in d:
            return Response({"cuenta": ["Este campo es obligatorio."]}, status=400)

        def _hacer():
            n = NotaSeguraService.crear_nota(self._usuario(), d["cuenta"], d["titulo"], d["contenido"])
            return {**_meta(n), "titulo": d["titulo"]}

        return Response(self._manejar(_hacer), status=201)

    def retrieve(self, request, pk=None):
        def _hacer():
            n = NotaSeguraService.obtener(self._usuario(), pk)
            return {
                **_meta(n),
                "titulo": NotaSeguraService.titulo(n),
                "contenido": NotaSeguraService.contenido(n),
            }

        return Response(self._manejar(_hacer))

    def partial_update(self, request, pk=None):
        ser = NotaSeguraEdicion(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        def _hacer():
            n = NotaSeguraService.actualizar_nota(
                self._usuario(), pk, titulo=d.get("titulo"), contenido=d.get("contenido")
            )
            return {**_meta(n), "titulo": NotaSeguraService.titulo(n)}

        return Response(self._manejar(_hacer))

    def destroy(self, request, pk=None):
        self._manejar(lambda: NotaSeguraService.eliminar(self._usuario(), pk))
        return Response(status=204)
