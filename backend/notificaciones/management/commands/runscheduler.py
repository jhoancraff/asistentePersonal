import logging

from apscheduler.schedulers.blocking import BlockingScheduler
from django.core.management.base import BaseCommand

from agenda.models import Evento
from agenda.services import EventoService
from notificaciones.models import Notificacion
from notificaciones.services import NotificacionService

log = logging.getLogger(__name__)


def recordar_eventos():
    for evento in EventoService.pendientes_de_recordar():
        NotificacionService.notificar(
            evento.creado_por,
            titulo=evento.titulo,
            mensaje=f"Tu evento empieza a las {evento.inicio.astimezone():%H:%M}",
            tipo=Notificacion.Tipo.EVENTO,
        )
        Evento.objects.filter(pk=evento.pk).update(recordatorio_enviado=True)


class Command(BaseCommand):
    help = "Proceso de tareas programadas (recordatorios de eventos, etc.)."

    def handle(self, *args, **options):
        scheduler = BlockingScheduler()
        scheduler.add_job(recordar_eventos, "interval", minutes=1, id="recordar_eventos")
        # Pendiente: resumen diario de saldos y reporte mensual (cron).
        self.stdout.write("Scheduler de Luz iniciado. Ctrl+C para salir.")
        try:
            scheduler.start()
        except (KeyboardInterrupt, SystemExit):
            pass
