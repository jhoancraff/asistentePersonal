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

        from . import voz

        contenido = b""
        if audio is not None:
            contenido = audio.read()
            audio.seek(0)
        mensaje = cls.crear(
            usuario, conversacion=conversacion, rol=Mensaje.Rol.USUARIO, texto=texto, audio=audio
        )

        def _asistente(texto_respuesta):
            return cls.crear(
                usuario,
                conversacion=conversacion,
                rol=Mensaje.Rol.ASISTENTE,
                texto=texto_respuesta,
            )

        if (texto or "").strip():
            return mensaje, agente.responder(usuario, conversacion)
        if audio is None:
            return mensaje, _asistente("No recibí ningún mensaje. Escríbeme o grábame un audio.")

        # Voz de entrada: se transcribe y el texto entra al agente como cualquier mensaje.
        try:
            transcripcion = voz.transcribir(
                contenido, nombre=getattr(audio, "name", "audio.webm"),
                tipo=getattr(audio, "content_type", "audio/webm"),
            )
        except voz.VozError as exc:
            return mensaje, _asistente(
                f"No pude transcribir tu audio ({exc}). Intenta de nuevo o escríbeme el mensaje."
            )
        if not transcripcion:
            return mensaje, _asistente(
                "No logré entender el audio. Habla un poco más cerca o inténtalo de nuevo."
            )
        mensaje.transcripcion = transcripcion
        mensaje.save(update_fields=["transcripcion", "fecha_actualizacion"])
        return mensaje, agente.responder(usuario, conversacion, por_voz=True)
