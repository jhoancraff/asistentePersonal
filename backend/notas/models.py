from django.db import models

from core.models import AuditModel


class Nota(AuditModel):
    titulo = models.CharField(max_length=200)
    contenido = models.TextField(blank=True)
    # Marca notas con información bancaria sensible (para tratarlas distinto más adelante).
    sensible = models.BooleanField(default=False)

    class Meta:
        ordering = ["-fecha_actualizacion"]

    def __str__(self):
        return self.titulo
