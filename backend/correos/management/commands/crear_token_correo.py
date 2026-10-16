from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from correos import services
from correos.models import IntegracionCorreo


class Command(BaseCommand):
    help = (
        "Crea (o reemplaza) la llave que usa el script de Gmail para enviar notificaciones "
        "bancarias a Luz. La llave se muestra UNA sola vez: guárdala en las Propiedades del "
        "script de Google, nunca en el repositorio."
    )

    def add_arguments(self, parser):
        parser.add_argument("--usuario", required=True, help="Nombre de usuario de Luz.")
        parser.add_argument("--desactivar", action="store_true", help="Desactiva la llave actual.")

    def handle(self, *args, **opts):
        User = get_user_model()
        try:
            usuario = User.objects.get(username=opts["usuario"])
        except User.DoesNotExist:
            raise CommandError(f"No existe el usuario «{opts['usuario']}».")

        if opts["desactivar"]:
            n = IntegracionCorreo.objects.filter(usuario=usuario).update(activa=False)
            self.stdout.write("Llave desactivada." if n else "Ese usuario no tenía llave.")
            return

        token = services.crear_token(usuario)
        self.stdout.write(self.style.WARNING("Guarda esta llave ahora; no se volverá a mostrar:"))
        self.stdout.write(f"LUZ_TOKEN={token}")
        self.stdout.write("Si ya existía una llave anterior, quedó invalidada.")
