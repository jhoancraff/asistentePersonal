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
        """Guarda el mensaje del usuario.

        PUNTO DE ENGANCHE DEL AGENTE: aquí, más adelante, se transcribirá el
        audio, se llamará a la IA y se ejecutarán las acciones registradas en
        core.registry (crear/eliminar/consultar), guardando la respuesta como
        un Mensaje con rol=asistente.
        """
        return cls.crear(
            usuario, conversacion=conversacion, rol=Mensaje.Rol.USUARIO, texto=texto, audio=audio
        )
