from django.db import models

from core.models import AuditModel


class Proveedor(AuditModel):
    """Institución donde vive una cuenta: banco, billetera digital o exchange cripto.

    Las filas con `creado_por` nulo son catálogo compartido (sembrado o importado);
    las que tienen dueño son instituciones que el propio usuario agregó.
    """

    class Clase(models.TextChoices):
        BANCO = "banco", "Banco"
        BILLETERA = "billetera", "Billetera digital"
        CRIPTO = "cripto", "Exchange / billetera cripto"

    clase = models.CharField(max_length=10, choices=Clase.choices, default=Clase.BANCO)
    nombre = models.CharField(max_length=160)
    pais = models.CharField(max_length=2, blank=True)  # ISO 3166-1 alfa-2; vacío = global
    codigo = models.CharField(max_length=10, blank=True)  # código local (ej. 0134 en Venezuela)
    bic = models.CharField(max_length=11, blank=True)  # SWIFT/BIC
    tema = models.CharField(max_length=20, default="generico")  # clave de estilo visual
    moneda_sugerida = models.CharField(max_length=10, blank=True)
    curado = models.BooleanField(default=False)

    class Meta:
        ordering = ["nombre"]
        indexes = [models.Index(fields=["clase", "pais"])]

    def __str__(self):
        return f"{self.nombre} ({self.pais or 'global'})"


class Cuenta(AuditModel):
    """Cuenta o instrumento financiero.

    SEGURIDAD: nunca se guarda el número completo de la tarjeta ni el CVV;
    solo los últimos 4 dígitos para poder identificarla.
    """

    class Tipo(models.TextChoices):
        AHORROS = "ahorros", "Cuenta de ahorros"
        CORRIENTE = "corriente", "Cuenta corriente"
        DEBITO = "debito", "Tarjeta de débito"
        CREDITO = "credito", "Tarjeta de crédito"
        DIVISAS = "divisas", "Cuenta en divisas"
        BILLETERA = "billetera", "Billetera digital"
        CRIPTO = "cripto", "Exchange / billetera cripto"
        EFECTIVO = "efectivo", "Efectivo"
        TARJETA = "tarjeta", "Tarjeta"  # legado
        OTRA = "otra", "Otra"

    nombre = models.CharField(max_length=100)
    banco = models.CharField(max_length=100, blank=True)
    banco_codigo = models.CharField(max_length=4, blank=True)
    tipo = models.CharField(max_length=20, choices=Tipo.choices, default=Tipo.AHORROS)
    # ISO 4217 (VES, USD, COP, EUR…) o activo cripto (USDT, BTC…). Por defecto bolívares.
    moneda = models.CharField(max_length=10, default="VES")
    saldo_inicial = models.DecimalField(max_digits=28, decimal_places=8, default=0)
    activa = models.BooleanField(default=True)
    titular = models.CharField(max_length=120, blank=True)
    documento = models.CharField(max_length=20, blank=True)  # ej. V-12345678
    ultimos_digitos = models.CharField(max_length=4, blank=True)
    vencimiento = models.CharField(max_length=5, blank=True)  # MM/AA
    red = models.CharField(max_length=12, blank=True)  # visa | mastercard | maestro
    pago_movil_telefono = models.CharField(max_length=11, blank=True)
    pais = models.CharField(max_length=2, blank=True)  # ISO 3166-1 alfa-2
    swift_bic = models.CharField(max_length=11, blank=True)
    # Correo, teléfono o usuario vinculado (billeteras y exchanges: Zelle, Zinli, Binance…)
    identificador = models.CharField(max_length=120, blank=True)
    tema = models.CharField(max_length=20, default="generico")
    # Clase de la institución emisora: una tarjeta puede ser de un banco o de una
    # billetera/exchange (p. ej. la tarjeta Visa de Binance o de Zinli).
    clase_institucion = models.CharField(max_length=10, default="banco")
    # Tarjeta vinculada: gasta el saldo de su cuenta madre y no tiene saldo propio.
    cuenta_madre = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="tarjetas"
    )

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return self.nombre


class Categoria(AuditModel):
    nombre = models.CharField(max_length=100)

    class Meta:
        ordering = ["nombre"]

    def __str__(self):
        return self.nombre


class Movimiento(AuditModel):
    class Tipo(models.TextChoices):
        INGRESO = "ingreso", "Ingreso"
        GASTO = "gasto", "Gasto"

    cuenta = models.ForeignKey(Cuenta, on_delete=models.CASCADE, related_name="movimientos")
    categoria = models.ForeignKey(
        Categoria, null=True, blank=True, on_delete=models.SET_NULL, related_name="movimientos"
    )
    tipo = models.CharField(max_length=10, choices=Tipo.choices)
    monto = models.DecimalField(max_digits=28, decimal_places=8)
    descripcion = models.CharField(max_length=255, blank=True)
    fecha = models.DateField()

    class Meta:
        ordering = ["-fecha", "-id"]

    def __str__(self):
        return f"{self.tipo} {self.monto}"
