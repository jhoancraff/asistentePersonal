import json
import logging

from django.conf import settings
from pywebpush import WebPushException, webpush

from core.services import CrudService

from .models import Notificacion, SuscripcionPush

log = logging.getLogger(__name__)


class NotificacionService(CrudService):
    model = Notificacion

    @classmethod
    def notificar(cls, usuario, titulo, mensaje="", tipo=Notificacion.Tipo.GENERAL):
        """Guarda la notificación y la empuja a todos los dispositivos del usuario."""
        # El sistema actúa en nombre del propio usuario (creado_por = usuario).
        notif = cls.crear(usuario, usuario=usuario, titulo=titulo, mensaje=mensaje, tipo=tipo)
        enviar_push(usuario, titulo, mensaje)
        return notif


class SuscripcionService(CrudService):
    model = SuscripcionPush

    @classmethod
    def registrar(cls, usuario, endpoint, p256dh, auth):
        obj, _ = SuscripcionPush.objects.update_or_create(
            endpoint=endpoint,
            defaults={
                "usuario": usuario,
                "p256dh": p256dh,
                "auth": auth,
                "actualizado_por": usuario,
                "creado_por": usuario,
            },
        )
        return obj


def enviar_push(usuario, titulo, mensaje=""):
    if not (settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY):
        log.warning("VAPID no configurado: se omite el push.")
        return
    payload = json.dumps({"title": titulo, "body": mensaje})
    for sub in SuscripcionPush.objects.filter(usuario=usuario):
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": f"mailto:{settings.VAPID_CLAIM_EMAIL}"},
            )
        except WebPushException as exc:
            status = getattr(exc.response, "status_code", None)
            if status in (404, 410):  # suscripción expirada
                sub.delete()
            else:
                log.error("Error enviando push: %s", exc)
