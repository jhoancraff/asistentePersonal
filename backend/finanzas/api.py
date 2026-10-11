import re

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from rest_framework.exceptions import PermissionDenied
from rest_framework import serializers

from core.api import AuditSerializer, ServiceViewSet

from .models import Categoria, Cuenta, Movimiento, Proveedor
from .services import CategoriaService, CuentaService, MovimientoService, ProveedorService
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
    class Meta(AuditSerializer.Meta):
        model = Movimiento


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
