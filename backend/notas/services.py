from core.services import CrudService

from .models import Nota


class NotaService(CrudService):
    model = Nota

    @classmethod
    def buscar(cls, usuario, texto):
        from django.db.models import Q

        return cls.listar(usuario).filter(Q(titulo__icontains=texto) | Q(contenido__icontains=texto))
