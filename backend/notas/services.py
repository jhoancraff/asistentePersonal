from core.registry import accion
from core.services import CrudService

from .models import Nota


class NotaService(CrudService):
    model = Nota

    @classmethod
    def buscar(cls, usuario, texto):
        from django.db.models import Q

        return cls.listar(usuario).filter(Q(titulo__icontains=texto) | Q(contenido__icontains=texto))


@accion("notas.crear_nota", "Guarda una nota")
def crear_nota(usuario, **datos):
    return NotaService.crear(usuario, **datos)


@accion("notas.buscar_notas", "Busca notas por texto")
def buscar_notas(usuario, texto):
    return NotaService.buscar(usuario, texto)


@accion("notas.eliminar_nota", "Elimina una nota")
def eliminar_nota(usuario, pk):
    return NotaService.eliminar(usuario, pk)
