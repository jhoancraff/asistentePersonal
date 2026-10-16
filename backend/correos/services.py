"""Procesa una notificación bancaria recibida por correo y la convierte en movimiento."""
import hashlib
import logging
import secrets

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from finanzas.models import Cuenta
from finanzas.services import MovimientoService

from . import parsers
from .models import CorreoBancario, IntegracionCorreo

log = logging.getLogger(__name__)
E = CorreoBancario.Estado


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def crear_token(usuario) -> str:
    """Crea (o reemplaza) la llave del usuario. Devuelve la llave en claro: mostrarla una vez."""
    token = "luz_" + secrets.token_urlsafe(32)
    IntegracionCorreo.objects.update_or_create(
        usuario=usuario,
        defaults={
            "token_hash": _hash(token),
            "token_prefijo": token[:8],
            "activa": True,
            "creado_por": usuario,
            "actualizado_por": usuario,
        },
    )
    return token


def usuario_por_token(token: str):
    """Usuario dueño de la llave, o None si no existe, está desactivada o el usuario inactivo."""
    if not token or len(token) > 200:
        return None
    integracion = (
        IntegracionCorreo.objects.select_related("usuario")
        .filter(token_hash=_hash(token), activa=True, usuario__is_active=True)
        .first()
    )
    if not integracion:
        return None
    IntegracionCorreo.objects.filter(pk=integracion.pk).update(ultimo_uso=timezone.now())
    return integracion.usuario


def _registrar(usuario, mensaje_id, estado, detalle="", **extra):
    return CorreoBancario.objects.create(
        creado_por=usuario,
        actualizado_por=usuario,
        mensaje_id=mensaje_id,
        estado=estado,
        detalle=detalle[:255],
        **extra,
    )


def _cuenta_de(usuario, op):
    """La cuenta propia del banco cuyos últimos 4 dígitos coinciden (None si hay 0 o varias)."""
    candidatas = Cuenta.objects.filter(
        creado_por=usuario,
        activa=True,
        banco__icontains=op.banco,
        ultimos_digitos=op.digitos_cuenta,
        cuenta_madre__isnull=True,
    )
    return candidatas.first() if candidatas.count() == 1 else None


def procesar(usuario, datos: dict) -> dict:
    """Devuelve {"estado": ..., "detalle": ..., "movimiento": id|None}. Nunca lanza por datos."""
    mensaje_id = str(datos.get("mensaje_id") or "").strip()[:255]
    if not mensaje_id:
        return {"estado": E.RECHAZADO, "detalle": "falta mensaje_id"}
    if CorreoBancario.objects.filter(creado_por=usuario, mensaje_id=mensaje_id).exists():
        return {"estado": E.DUPLICADO, "detalle": "correo ya procesado"}

    remitente = str(datos.get("remitente") or "")
    texto = str(datos.get("texto") or "")[: settings.CORREO_MAX_CARACTERES]
    direccion = parsers.parseaddr(remitente)[1].lower()
    dominio = parsers.dominio_remitente(remitente)

    def cerrar(estado, detalle="", **extra):
        try:
            with transaction.atomic():
                _registrar(usuario, mensaje_id, estado, detalle, **extra)
        except IntegrityError:  # el mismo correo llegó dos veces a la vez
            return {"estado": E.DUPLICADO, "detalle": "correo ya procesado"}
        return {"estado": estado, "detalle": detalle}

    if direccion not in settings.CORREO_REMITENTES_PERMITIDOS or dominio not in parsers.PARSERS:
        return cerrar(E.RECHAZADO, "remitente no permitido")
    if settings.CORREO_EXIGIR_AUTENTICACION and not parsers.autenticado(
        datos.get("autenticacion"), dominio
    ):
        return cerrar(E.RECHAZADO, "el correo no pasó la verificación SPF/DKIM/DMARC")

    op = parsers.PARSERS[dominio](texto)
    if op is None:
        return cerrar(E.NO_RECONOCIDO, "formato de notificación no reconocido")
    if op.tipo != "gasto":
        return cerrar(E.NO_RECONOCIDO, "solo se registran salidas por ahora", banco=op.banco)

    if CorreoBancario.objects.filter(
        creado_por=usuario, banco=op.banco, referencia=op.referencia
    ).exists():
        return cerrar(E.DUPLICADO, "referencia ya registrada", banco=op.banco)

    cuenta = _cuenta_de(usuario, op)
    if cuenta is None:
        return cerrar(
            E.SIN_CUENTA,
            f"no hay una cuenta {op.banco} única terminada en {op.digitos_cuenta}",
            banco=op.banco,
            referencia=op.referencia,
            monto=op.monto,
        )

    try:
        with transaction.atomic():
            movimiento = MovimientoService.crear(
                usuario,
                cuenta=cuenta,
                tipo=op.tipo,
                monto=op.monto,
                descripcion=f"{op.descripcion} · Ref. {op.referencia}",
                fecha=op.fecha,
            )
            _registrar(
                usuario,
                mensaje_id,
                E.REGISTRADO,
                banco=op.banco,
                referencia=op.referencia,
                monto=op.monto,
                movimiento=movimiento,
            )
    except IntegrityError:  # carrera con otro envío del mismo correo/referencia
        return {"estado": E.DUPLICADO, "detalle": "correo ya procesado"}

    log.info("Correo %s: movimiento %s registrado en la cuenta %s", op.banco, movimiento.pk, cuenta.pk)
    return {"estado": E.REGISTRADO, "detalle": "", "movimiento": movimiento.pk}
