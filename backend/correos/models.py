from django.conf import settings
from django.db import models
from django.db.models import Q

from core.models import AuditModel


class IntegracionCorreo(AuditModel):
    """Llave con la que el script de Gmail de un usuario envía sus notificaciones bancarias.

    Solo se guarda el hash SHA-256 de la llave (alta entropía); la llave real se muestra una
    única vez al crearla (`manage.py crear_token_correo`). La llave únicamente permite
    proponer movimientos de ESE usuario: no da acceso a nada más de la app.
    """

    usuario = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="integracion_correo"
    )
    token_hash = models.CharField(max_length=64, unique=True)
    token_prefijo = models.CharField(max_length=12)  # para reconocerla sin revelarla
    activa = models.BooleanField(default=True)
    ultimo_uso = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Correo de {self.usuario_id} ({self.token_prefijo}…)"


class CorreoBancario(AuditModel):
    """Registro de cada correo bancario recibido: evita duplicados y permite auditar.

    NO guarda el contenido del correo, solo los datos extraídos.
    """

    class Estado(models.TextChoices):
        REGISTRADO = "registrado", "Registrado"
        DUPLICADO = "duplicado", "Duplicado"
        SIN_CUENTA = "sin_cuenta", "Sin cuenta"
        NO_RECONOCIDO = "no_reconocido", "No reconocido"
        RECHAZADO = "rechazado", "Rechazado"

    mensaje_id = models.CharField(max_length=255)
    banco = models.CharField(max_length=40, blank=True)
    referencia = models.CharField(max_length=40, blank=True)
    estado = models.CharField(max_length=20, choices=Estado.choices)
    detalle = models.CharField(max_length=255, blank=True)
    monto = models.DecimalField(max_digits=28, decimal_places=8, null=True, blank=True)
    movimiento = models.OneToOneField(
        "finanzas.Movimiento",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="correo",
    )

    class Meta:
        ordering = ["-fecha_creacion", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["creado_por", "mensaje_id"], name="correo_mensaje_unico_por_usuario"
            ),
            models.UniqueConstraint(
                fields=["creado_por", "banco", "referencia"],
                condition=~Q(referencia=""),
                name="correo_referencia_unica_por_banco",
            ),
        ]

    def __str__(self):
        return f"{self.banco} {self.referencia} · {self.estado}"
