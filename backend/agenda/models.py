from django.db import models

from core.models import AuditModel


class Evento(AuditModel):
    titulo = models.CharField(max_length=200)
    descripcion = models.TextField(blank=True)
    inicio = models.DateTimeField()
    fin = models.DateTimeField(null=True, blank=True)
    recordar_minutos_antes = models.PositiveIntegerField(default=0)
    recordatorio_enviado = models.BooleanField(default=False)
    completado = models.BooleanField(default=False)

    class Meta:
        ordering = ["inicio"]

    def __str__(self):
        return self.titulo
