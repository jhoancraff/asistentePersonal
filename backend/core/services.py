"""Capa de servicios genérica.

Toda acción de la app (crear, editar, eliminar, consultar) debe pasar por un
servicio, no por la vista. Así la API REST y, más adelante, el agente del chat
(texto o voz) ejecutan exactamente la misma lógica y la misma auditoría.
"""
from django.core.exceptions import ObjectDoesNotExist


class CrudService:
    """Servicio CRUD con auditoría y aislamiento por usuario."""

    model = None
    # Campos que nunca se aceptan desde afuera.
    protegidos = ("id", "pk", "creado_por", "fecha_creacion", "actualizado_por", "fecha_actualizacion")

    @classmethod
    def _limpiar(cls, datos):
        return {k: v for k, v in datos.items() if k not in cls.protegidos}

    @classmethod
    def listar(cls, actor, **filtros):
        return cls.model.objects.filter(creado_por=actor, **filtros)

    @classmethod
    def obtener(cls, actor, pk):
        try:
            return cls.listar(actor).get(pk=pk)
        except ObjectDoesNotExist:
            raise ObjectDoesNotExist(f"{cls.model.__name__} {pk} no existe")

    @classmethod
    def crear(cls, actor, **datos):
        return cls.model.objects.create(
            creado_por=actor, actualizado_por=actor, **cls._limpiar(datos)
        )

    @classmethod
    def actualizar(cls, actor, pk, **datos):
        obj = cls.obtener(actor, pk)
        for campo, valor in cls._limpiar(datos).items():
            setattr(obj, campo, valor)
        obj.actualizado_por = actor
        obj.save()
        return obj

    @classmethod
    def eliminar(cls, actor, pk):
        cls.obtener(actor, pk).delete()
