"""Herramientas que el agente puede usar sobre los datos del usuario.

Reglas de oro:
- Los argumentos vienen del modelo de IA: son datos NO confiables. Cada herramienta
  de escritura valida y normaliza en `_preparar_*` antes de pedir confirmación.
- Todo acceso pasa por la capa de servicios, que aísla por usuario.
- Lo que escribe (crear/editar/eliminar) nunca se ejecuta sin confirmación explícita.
- NO se exponen las notas seguras cifradas ni las notas marcadas como sensibles.
"""
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Q, Sum
from django.utils import timezone

from agenda.models import Evento
from agenda.services import EventoService
from core.registry import accion
from finanzas.models import Categoria, Cuenta, Movimiento
from finanzas.services import CategoriaService, CuentaService, MovimientoService
from notas.models import Nota
from notas.services import NotaService

MAX_FILAS = 30
MAX_MONTO = Decimal("1000000000000")


# ───────────────────────── utilidades ─────────────────────────
def _num(valor, decimales=2) -> str:
    """1234.5 → '1.234,50' (formato es-VE)."""
    texto = f"{Decimal(valor):,.{decimales}f}"
    return texto.replace(",", "§").replace(".", ",").replace("§", ".")


FIAT_2_DECIMALES = ("VES", "USD", "EUR", "COP", "MXN", "ARS", "BRL", "CLP", "PEN", "GBP", "CAD")


def _cant(valor, moneda) -> str:
    """Monto para el modelo: sin ceros de relleno que confundan (45.00, nunca 45.00000000).

    Fiat con 2 decimales; cripto hasta 8 sin ceros finales. Siempre punto decimal.
    """
    v = Decimal(valor)
    if moneda in FIAT_2_DECIMALES:
        return str(v.quantize(Decimal("0.01")))
    texto = format(v.quantize(Decimal("0.00000001")), "f").rstrip("0").rstrip(".")
    return texto or "0"


def _dinero(valor, moneda) -> str:
    v = Decimal(valor)
    if moneda == "VES":
        return f"Bs. {_num(v)}"
    if moneda == "USD":
        return f"US$ {_num(v)}"
    return f"{_num(v, 0 if moneda == 'COP' else 2)} {moneda}"


def _hoy() -> date:
    return timezone.localdate()


def _fecha(valor, defecto=None) -> date:
    if valor in (None, ""):
        if defecto is None:
            raise ValueError("Falta la fecha.")
        return defecto
    try:
        return date.fromisoformat(str(valor)[:10])
    except ValueError as exc:
        raise ValueError(f"Fecha inválida «{valor}». Usa el formato AAAA-MM-DD.") from exc


def _fecha_hora(valor) -> datetime:
    if not valor:
        raise ValueError("Falta la fecha y hora.")
    try:
        dt = datetime.fromisoformat(str(valor).replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(
            f"Fecha y hora inválidas «{valor}». Usa AAAA-MM-DDTHH:MM (hora local)."
        ) from exc
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return dt


def _monto(valor) -> Decimal:
    try:
        m = Decimal(str(valor).replace(",", "."))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"Monto inválido «{valor}».") from exc
    if not m.is_finite() or m <= 0:
        raise ValueError("El monto debe ser mayor que cero.")
    if m > MAX_MONTO:
        raise ValueError("El monto es demasiado grande.")
    return m.quantize(Decimal("0.01"))


def _texto(valor, campo, maximo, obligatorio=True) -> str:
    t = str(valor or "").strip()
    if obligatorio and not t:
        raise ValueError(f"Falta {campo}.")
    return t[:maximo]


def _id(valor, campo="id") -> int:
    try:
        return int(valor)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{campo} inválido.") from exc


def _cuenta(usuario, ref) -> Cuenta:
    """Resuelve una cuenta por id o por nombre/banco (debe ser única)."""
    cuentas = list(CuentaService.listar(usuario))
    if not cuentas:
        raise ValueError("El usuario no tiene cuentas registradas.")
    ref = str(ref or "").strip()
    if not ref:
        raise ValueError("Indica la cuenta.")
    if ref.isdigit():
        for c in cuentas:
            if c.id == int(ref):
                return c
    q = ref.lower()
    exactas = [c for c in cuentas if q in (c.nombre.lower(), c.banco.lower())]
    candidatas = exactas or [
        c for c in cuentas if q in c.nombre.lower() or q in c.banco.lower()
    ]
    if len(candidatas) == 1:
        return candidatas[0]
    opciones = ", ".join(f"«{c.nombre}» (id {c.id})" for c in (candidatas or cuentas)[:8])
    if not candidatas:
        raise ValueError(f"No encontré la cuenta «{ref}». Cuentas disponibles: {opciones}.")
    raise ValueError(f"«{ref}» coincide con varias cuentas: {opciones}. Indica cuál (por id).")


def _categoria_nombre(valor) -> str:
    return _texto(valor, "la categoría", 100, obligatorio=False)


def _obtener_categoria(usuario, nombre):
    """Categoría propia por nombre (sin distinguir mayúsculas); la crea si no existe."""
    if not nombre:
        return None
    existente = CategoriaService.listar(usuario).filter(nombre__iexact=nombre).first()
    return existente or CategoriaService.crear(usuario, nombre=nombre)


def _movimiento(usuario, ref) -> Movimiento:
    try:
        return MovimientoService.obtener(usuario, _id(ref, "id del movimiento"))
    except ObjectDoesNotExist as exc:
        raise ValueError("No encontré ese movimiento.") from exc


def _evento(usuario, ref) -> Evento:
    try:
        return EventoService.obtener(usuario, _id(ref, "id del evento"))
    except ObjectDoesNotExist as exc:
        raise ValueError("No encontré ese evento.") from exc


def _nota(usuario, ref) -> Nota:
    try:
        nota = NotaService.obtener(usuario, _id(ref, "id de la nota"))
    except ObjectDoesNotExist as exc:
        raise ValueError("No encontré esa nota.") from exc
    if nota.sensible:
        raise ValueError("Esa nota es sensible; solo puedes gestionarla desde la aplicación.")
    return nota


def _fecha_legible(d: date) -> str:
    if d == _hoy():
        return "hoy"
    if d == _hoy() - timedelta(days=1):
        return "ayer"
    return d.strftime("%d/%m/%Y")


def _de_fecha(d: date) -> str:
    """«de hoy», «de ayer» o «del 05/10/2026» (con la preposición correcta)."""
    if d == _hoy():
        return "de hoy"
    if d == _hoy() - timedelta(days=1):
        return "de ayer"
    return f"del {d.strftime('%d/%m/%Y')}"


def _hora_legible(dt: datetime) -> str:
    return timezone.localtime(dt).strftime("%d/%m/%Y %H:%M")


# ───────────────────────── lectura ─────────────────────────
@accion(
    "finanzas.listar_cuentas",
    "Lista las cuentas, tarjetas y billeteras del usuario con su saldo actual y moneda. "
    "Úsala primero cuando necesites saber qué cuentas existen o sus saldos.",
)
def listar_cuentas(usuario):
    cuentas = list(CuentaService.listar(usuario).select_related("cuenta_madre"))
    filas = []
    for c in cuentas:
        fila = {
            "id": c.id,
            "nombre": c.nombre,
            "institucion": c.banco,
            "tipo": c.tipo,
            "moneda": c.moneda,
            "saldo": _cant(CuentaService.saldo(usuario, c.id), c.moneda),
            "activa": c.activa,
        }
        if c.ultimos_digitos:
            fila["ultimos_digitos"] = c.ultimos_digitos
        if c.cuenta_madre_id:
            fila["usa_el_saldo_de"] = c.cuenta_madre.nombre
        filas.append(fila)
    return {"cuentas": filas}


@accion(
    "finanzas.saldo_cuenta",
    "Devuelve el saldo actual de una cuenta indicada por nombre, banco o id.",
    parametros={
        "type": "object",
        "properties": {"cuenta": {"type": "string", "description": "Nombre, banco o id de la cuenta"}},
        "required": ["cuenta"],
    },
)
def saldo_cuenta(usuario, cuenta):
    c = _cuenta(usuario, cuenta)
    return {
        "cuenta": c.nombre,
        "moneda": c.moneda,
        "saldo": _cant(CuentaService.saldo(usuario, c.id), c.moneda),
    }


@accion(
    "finanzas.listar_movimientos",
    "Lista movimientos (ingresos y gastos) recientes, opcionalmente filtrados por cuenta, "
    "rango de fechas o tipo. Devuelve como máximo 30, del más reciente al más antiguo.",
    parametros={
        "type": "object",
        "properties": {
            "cuenta": {"type": "string", "description": "Nombre, banco o id de la cuenta (opcional)"},
            "desde": {"type": "string", "description": "Fecha inicial AAAA-MM-DD (opcional)"},
            "hasta": {"type": "string", "description": "Fecha final AAAA-MM-DD (opcional)"},
            "tipo": {"type": "string", "enum": ["ingreso", "gasto"]},
            "limite": {"type": "integer", "description": "Máximo de filas (1 a 30)"},
        },
    },
)
def listar_movimientos(usuario, cuenta=None, desde=None, hasta=None, tipo=None, limite=15):
    qs = MovimientoService.listar(usuario).select_related("cuenta", "categoria")
    if cuenta:
        c = _cuenta(usuario, cuenta)
        ids = [c.id, *c.tarjetas.values_list("id", flat=True)]
        qs = qs.filter(cuenta_id__in=ids)
    if desde:
        qs = qs.filter(fecha__gte=_fecha(desde))
    if hasta:
        qs = qs.filter(fecha__lte=_fecha(hasta))
    if tipo in ("ingreso", "gasto"):
        qs = qs.filter(tipo=tipo)
    try:
        limite = max(1, min(int(limite), MAX_FILAS))
    except (TypeError, ValueError):
        limite = 15
    return {
        "movimientos": [
            {
                "id": m.id,
                "fecha": m.fecha.isoformat(),
                "tipo": m.tipo,
                "monto": _cant(m.monto, m.cuenta.moneda),
                "moneda": m.cuenta.moneda,
                "descripcion": m.descripcion,
                "categoria": m.categoria.nombre if m.categoria_id else None,
                "cuenta": m.cuenta.nombre,
            }
            for m in qs.order_by("-fecha", "-id")[:limite]
        ]
    }


@accion(
    "finanzas.resumen_periodo",
    "Resume ingresos y gastos de un periodo (por defecto el mes actual), por moneda y con "
    "los gastos principales por categoría.",
    parametros={
        "type": "object",
        "properties": {
            "desde": {"type": "string", "description": "AAAA-MM-DD (por defecto, inicio del mes)"},
            "hasta": {"type": "string", "description": "AAAA-MM-DD (por defecto, hoy)"},
        },
    },
)
def resumen_periodo(usuario, desde=None, hasta=None):
    hoy = _hoy()
    d = _fecha(desde, hoy.replace(day=1))
    h = _fecha(hasta, hoy)
    qs = MovimientoService.listar(usuario).filter(fecha__gte=d, fecha__lte=h)
    por_moneda: dict[str, dict] = {}
    for fila in qs.values("cuenta__moneda", "tipo").annotate(total=Sum("monto")):
        mon = por_moneda.setdefault(
            fila["cuenta__moneda"], {"ingresos": Decimal(0), "gastos": Decimal(0)}
        )
        mon["ingresos" if fila["tipo"] == "ingreso" else "gastos"] += fila["total"]
    categorias = {}
    for fila in (
        qs.filter(tipo="gasto")
        .values("cuenta__moneda", "categoria__nombre")
        .annotate(total=Sum("monto"))
        .order_by("-total")[:8]
    ):
        categorias.setdefault(fila["cuenta__moneda"], []).append(
            {
                "categoria": fila["categoria__nombre"] or "Sin categoría",
                "total": _cant(fila["total"], fila["cuenta__moneda"]),
            }
        )
    return {
        "desde": d.isoformat(),
        "hasta": h.isoformat(),
        "por_moneda": {
            m: {
                "ingresos": _cant(v["ingresos"], m),
                "gastos": _cant(v["gastos"], m),
                "neto": _cant(v["ingresos"] - v["gastos"], m),
            }
            for m, v in por_moneda.items()
        },
        "gastos_por_categoria": categorias,
    }


@accion(
    "agenda.listar_eventos",
    "Lista eventos de la agenda (por defecto los próximos 14 días). Máximo 30.",
    parametros={
        "type": "object",
        "properties": {
            "desde": {"type": "string", "description": "AAAA-MM-DD (por defecto hoy)"},
            "hasta": {"type": "string", "description": "AAAA-MM-DD (por defecto en 14 días)"},
        },
    },
)
def listar_eventos(usuario, desde=None, hasta=None):
    d = _fecha(desde, _hoy())
    h = _fecha(hasta, d + timedelta(days=14))
    tz = timezone.get_current_timezone()
    ini = timezone.make_aware(datetime.combine(d, datetime.min.time()), tz)
    fin = timezone.make_aware(datetime.combine(h + timedelta(days=1), datetime.min.time()), tz)
    eventos = EventoService.listar(usuario).filter(inicio__gte=ini, inicio__lt=fin)[:MAX_FILAS]
    return {
        "eventos": [
            {
                "id": e.id,
                "titulo": e.titulo,
                "inicio": timezone.localtime(e.inicio).strftime("%Y-%m-%dT%H:%M"),
                "fin": timezone.localtime(e.fin).strftime("%Y-%m-%dT%H:%M") if e.fin else None,
                "completado": e.completado,
                "recordar_minutos_antes": e.recordar_minutos_antes,
            }
            for e in eventos
        ]
    }


@accion(
    "notas.buscar_notas",
    "Busca en las notas normales del usuario por texto (título o contenido). No incluye "
    "notas sensibles ni notas seguras. Máximo 10 resultados.",
    parametros={
        "type": "object",
        "properties": {"texto": {"type": "string", "description": "Texto a buscar"}},
        "required": ["texto"],
    },
)
def buscar_notas(usuario, texto):
    texto = _texto(texto, "el texto a buscar", 100)
    notas = NotaService.listar(usuario).filter(sensible=False).filter(
        Q(titulo__icontains=texto) | Q(contenido__icontains=texto)
    )[:10]
    return {
        "notas": [{"id": n.id, "titulo": n.titulo, "contenido": n.contenido[:500]} for n in notas]
    }


# ───────────────────────── escritura (con confirmación) ─────────────────────────
def _preparar_crear_movimiento(usuario, a):
    cuenta = _cuenta(usuario, a.get("cuenta"))
    tipo = a.get("tipo")
    if tipo not in ("ingreso", "gasto"):
        raise ValueError("El tipo debe ser «ingreso» o «gasto».")
    monto = _monto(a.get("monto"))
    fecha = _fecha(a.get("fecha"), _hoy())
    desc = _texto(a.get("descripcion"), "la descripción", 255, obligatorio=False)
    cat = _categoria_nombre(a.get("categoria"))
    params = {
        "cuenta_id": cuenta.id,
        "tipo": tipo,
        "monto": str(monto),
        "descripcion": desc,
        "categoria": cat,
        "fecha": fecha.isoformat(),
    }
    verbo = "gasto" if tipo == "gasto" else "ingreso"
    resumen = (
        f"Registrar un {verbo} de {_dinero(monto, cuenta.moneda)} en «{cuenta.nombre}»"
        + (f" — {desc}" if desc else "")
        + (f" · categoría {cat}" if cat else "")
        + f" ({_fecha_legible(fecha)})"
    )
    return params, resumen


@accion(
    "finanzas.crear_movimiento",
    "Registra un ingreso o un gasto en una cuenta. Requiere confirmación del usuario.",
    parametros={
        "type": "object",
        "properties": {
            "cuenta": {"type": "string", "description": "Nombre, banco o id de la cuenta"},
            "tipo": {"type": "string", "enum": ["ingreso", "gasto"]},
            "monto": {"type": "number", "description": "Monto positivo, en la moneda de la cuenta"},
            "descripcion": {"type": "string"},
            "categoria": {"type": "string", "description": "Nombre de la categoría (opcional)"},
            "fecha": {"type": "string", "description": "AAAA-MM-DD (por defecto hoy)"},
        },
        "required": ["cuenta", "tipo", "monto"],
    },
    escribe=True,
    preparar=_preparar_crear_movimiento,
)
def crear_movimiento(usuario, cuenta_id, tipo, monto, descripcion="", categoria=None, fecha=None):
    cuenta = _cuenta(usuario, cuenta_id)
    mov = MovimientoService.crear(
        usuario,
        cuenta=cuenta,
        categoria=_obtener_categoria(usuario, categoria),
        tipo=tipo,
        monto=Decimal(monto),
        descripcion=descripcion,
        fecha=_fecha(fecha, _hoy()),
    )
    return {"id": mov.id, "mensaje": "Movimiento registrado."}


def _preparar_editar_movimiento(usuario, a):
    mov = _movimiento(usuario, a.get("id"))
    cambios = {}
    partes = []
    if a.get("monto") not in (None, ""):
        cambios["monto"] = str(_monto(a["monto"]))
        partes.append(f"monto {_dinero(cambios['monto'], mov.cuenta.moneda)}")
    if a.get("descripcion") not in (None, ""):
        cambios["descripcion"] = _texto(a["descripcion"], "la descripción", 255)
        partes.append(f"descripción «{cambios['descripcion']}»")
    if a.get("fecha") not in (None, ""):
        cambios["fecha"] = _fecha(a["fecha"]).isoformat()
        partes.append(f"fecha {_fecha_legible(_fecha(a['fecha']))}")
    if a.get("categoria") not in (None, ""):
        cambios["categoria"] = _categoria_nombre(a["categoria"])
        partes.append(f"categoría {cambios['categoria']}")
    if not cambios:
        raise ValueError("No indicaste qué cambiar (monto, descripción, fecha o categoría).")
    actual = f"{mov.tipo} de {_dinero(mov.monto, mov.cuenta.moneda)} {_de_fecha(mov.fecha)}"
    resumen = f"Editar el {actual} en «{mov.cuenta.nombre}»: " + ", ".join(partes)
    return {"id": mov.id, **cambios}, resumen


@accion(
    "finanzas.editar_movimiento",
    "Edita un movimiento existente (monto, descripción, fecha o categoría). Requiere "
    "confirmación. Obtén el id con finanzas.listar_movimientos.",
    parametros={
        "type": "object",
        "properties": {
            "id": {"type": "integer"},
            "monto": {"type": "number"},
            "descripcion": {"type": "string"},
            "fecha": {"type": "string", "description": "AAAA-MM-DD"},
            "categoria": {"type": "string"},
        },
        "required": ["id"],
    },
    escribe=True,
    preparar=_preparar_editar_movimiento,
)
def editar_movimiento(usuario, id, **cambios):
    datos = {}
    if "monto" in cambios:
        datos["monto"] = Decimal(cambios["monto"])
    if "descripcion" in cambios:
        datos["descripcion"] = cambios["descripcion"]
    if "fecha" in cambios:
        datos["fecha"] = _fecha(cambios["fecha"])
    if "categoria" in cambios:
        datos["categoria"] = _obtener_categoria(usuario, cambios["categoria"])
    MovimientoService.actualizar(usuario, id, **datos)
    return {"id": id, "mensaje": "Movimiento actualizado."}


def _preparar_eliminar_movimiento(usuario, a):
    mov = _movimiento(usuario, a.get("id"))
    resumen = (
        f"Eliminar el {mov.tipo} de {_dinero(mov.monto, mov.cuenta.moneda)} "
        f"{_de_fecha(mov.fecha)} en «{mov.cuenta.nombre}»"
        + (f" ({mov.descripcion})" if mov.descripcion else "")
    )
    return {"id": mov.id}, resumen


@accion(
    "finanzas.eliminar_movimiento",
    "Elimina un movimiento. Requiere confirmación. Obtén el id con finanzas.listar_movimientos.",
    parametros={
        "type": "object",
        "properties": {"id": {"type": "integer"}},
        "required": ["id"],
    },
    escribe=True,
    preparar=_preparar_eliminar_movimiento,
)
def eliminar_movimiento(usuario, id):
    MovimientoService.eliminar(usuario, id)
    return {"mensaje": "Movimiento eliminado."}


def _preparar_crear_evento(usuario, a):
    titulo = _texto(a.get("titulo"), "el título", 200)
    inicio = _fecha_hora(a.get("inicio"))
    fin = _fecha_hora(a["fin"]) if a.get("fin") else None
    if fin and fin <= inicio:
        raise ValueError("El fin debe ser posterior al inicio.")
    try:
        recordar = int(a.get("recordar_minutos_antes", 0) or 0)
    except (TypeError, ValueError) as exc:
        raise ValueError("recordar_minutos_antes debe ser un número.") from exc
    if not 0 <= recordar <= 10080:
        raise ValueError("El recordatorio debe estar entre 0 y 10080 minutos.")
    params = {
        "titulo": titulo,
        "inicio": inicio.isoformat(),
        "fin": fin.isoformat() if fin else None,
        "recordar_minutos_antes": recordar,
        "descripcion": _texto(a.get("descripcion"), "la descripción", 1000, obligatorio=False),
    }
    resumen = f"Crear el evento «{titulo}» el {_hora_legible(inicio)}" + (
        f" (recordar {recordar} min antes)" if recordar else ""
    )
    return params, resumen


@accion(
    "agenda.crear_evento",
    "Crea un evento en la agenda. Requiere confirmación. La hora es la local del usuario.",
    parametros={
        "type": "object",
        "properties": {
            "titulo": {"type": "string"},
            "inicio": {"type": "string", "description": "AAAA-MM-DDTHH:MM, hora local"},
            "fin": {"type": "string", "description": "AAAA-MM-DDTHH:MM (opcional)"},
            "recordar_minutos_antes": {"type": "integer"},
            "descripcion": {"type": "string"},
        },
        "required": ["titulo", "inicio"],
    },
    escribe=True,
    preparar=_preparar_crear_evento,
)
def crear_evento(usuario, titulo, inicio, fin=None, recordar_minutos_antes=0, descripcion=""):
    ev = EventoService.crear(
        usuario,
        titulo=titulo,
        descripcion=descripcion,
        inicio=_fecha_hora(inicio),
        fin=_fecha_hora(fin) if fin else None,
        recordar_minutos_antes=recordar_minutos_antes,
    )
    return {"id": ev.id, "mensaje": "Evento creado."}


def _preparar_mover_evento(usuario, a):
    ev = _evento(usuario, a.get("id"))
    nuevo = _fecha_hora(a.get("nuevo_inicio"))
    resumen = (
        f"Mover el evento «{ev.titulo}» del {_hora_legible(ev.inicio)} al {_hora_legible(nuevo)}"
    )
    return {"id": ev.id, "nuevo_inicio": nuevo.isoformat()}, resumen


@accion(
    "agenda.mover_evento",
    "Cambia la fecha y hora de un evento. Requiere confirmación. Obtén el id con "
    "agenda.listar_eventos.",
    parametros={
        "type": "object",
        "properties": {
            "id": {"type": "integer"},
            "nuevo_inicio": {"type": "string", "description": "AAAA-MM-DDTHH:MM, hora local"},
        },
        "required": ["id", "nuevo_inicio"],
    },
    escribe=True,
    preparar=_preparar_mover_evento,
)
def mover_evento(usuario, id, nuevo_inicio):
    EventoService.mover(usuario, id, _fecha_hora(nuevo_inicio))
    return {"id": id, "mensaje": "Evento movido."}


def _preparar_eliminar_evento(usuario, a):
    ev = _evento(usuario, a.get("id"))
    return {"id": ev.id}, f"Eliminar el evento «{ev.titulo}» del {_hora_legible(ev.inicio)}"


@accion(
    "agenda.eliminar_evento",
    "Elimina un evento de la agenda. Requiere confirmación.",
    parametros={
        "type": "object",
        "properties": {"id": {"type": "integer"}},
        "required": ["id"],
    },
    escribe=True,
    preparar=_preparar_eliminar_evento,
)
def eliminar_evento(usuario, id):
    EventoService.eliminar(usuario, id)
    return {"mensaje": "Evento eliminado."}


def _preparar_crear_nota(usuario, a):
    titulo = _texto(a.get("titulo"), "el título", 200)
    contenido = _texto(a.get("contenido"), "el contenido", 5000)
    return {"titulo": titulo, "contenido": contenido}, f"Guardar la nota «{titulo}»"


@accion(
    "notas.crear_nota",
    "Guarda una nota normal. Requiere confirmación. No sirve para claves ni datos sensibles.",
    parametros={
        "type": "object",
        "properties": {"titulo": {"type": "string"}, "contenido": {"type": "string"}},
        "required": ["titulo", "contenido"],
    },
    escribe=True,
    preparar=_preparar_crear_nota,
)
def crear_nota(usuario, titulo, contenido):
    n = NotaService.crear(usuario, titulo=titulo, contenido=contenido, sensible=False)
    return {"id": n.id, "mensaje": "Nota guardada."}


def _preparar_eliminar_nota(usuario, a):
    n = _nota(usuario, a.get("id"))
    return {"id": n.id}, f"Eliminar la nota «{n.titulo}»"


@accion(
    "notas.eliminar_nota",
    "Elimina una nota normal. Requiere confirmación.",
    parametros={
        "type": "object",
        "properties": {"id": {"type": "integer"}},
        "required": ["id"],
    },
    escribe=True,
    preparar=_preparar_eliminar_nota,
)
def eliminar_nota(usuario, id):
    n = _nota(usuario, id)
    NotaService.eliminar(usuario, n.id)
    return {"mensaje": "Nota eliminada."}
