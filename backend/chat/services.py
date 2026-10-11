from core.services import CrudService

from .models import Conversacion, Mensaje


class ConversacionService(CrudService):
    model = Conversacion

    @classmethod
    def crear(cls, actor, **datos):
        return super().crear(actor, usuario=actor, **datos)


class MensajeService(CrudService):
    model = Mensaje

    @classmethod
    def enviar(cls, usuario, conversacion, texto="", audio=None):
        """Guarda el mensaje del usuario y devuelve (mensaje_usuario, respuesta_asistente)."""
        from . import agente  # import diferido: evita ciclos y carga de proveedores al migrar

        mensaje = cls.crear(
            usuario, conversacion=conversacion, rol=Mensaje.Rol.USUARIO, texto=texto, audio=audio
        )
        if (texto or "").strip():
            respuesta = agente.responder(usuario, conversacion)
        else:
            # Fase 1 es solo texto: el audio se guarda, pero todavía no se transcribe.
            respuesta = cls.crear(
                usuario,
                conversacion=conversacion,
                rol=Mensaje.Rol.ASISTENTE,
                texto="Guardé tu audio, pero todavía no puedo escucharlo: la voz llega en la "
                "siguiente fase. Por ahora escríbeme y te ayudo.",
            )
        return mensaje, respuesta
