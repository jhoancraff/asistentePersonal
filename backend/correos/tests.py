from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from finanzas.models import Cuenta, Movimiento

from . import parsers, services
from .models import CorreoBancario

# Datos ficticios con el mismo formato de la notificación real de Bancamiga.
CORREO = (
    "Estimado Sr(a). USUARIO DE PRUEBA El Pago Móvil desde la Cuenta Nro. "
    "0172-****-**-*****1519 por 3.210,00 el 15/10/2026 18:34 ha sido procesado con éxito. "
    "Ref. 43154721 Si desconoce esta operación comuníquese al 0500-8822622"
)
REMITENTE = "BANCAMIGA <no-reply@bancamiga.com>"
AUTENTICADO = (
    "mx.google.com; dkim=pass header.i=@bancamiga.com header.s=sel header.b=abc; "
    "spf=pass smtp.mailfrom=no-reply@bancamiga.com; "
    "dmarc=pass (p=NONE sp=NONE dis=NONE) header.from=bancamiga.com"
)


class ParserTests(SimpleTestCase):
    def test_extrae_pago_movil(self):
        op = parsers.parsear_bancamiga(CORREO)
        self.assertEqual(op.tipo, "gasto")
        self.assertEqual(op.monto, Decimal("3210.00"))
        self.assertEqual(op.referencia, "43154721")
        self.assertEqual(op.digitos_cuenta, "1519")
        self.assertEqual(op.descripcion, "Pago Móvil")
        self.assertEqual((op.fecha.year, op.fecha.month, op.fecha.day), (2026, 10, 15))

    def test_monto_sin_miles_y_con_espacios_raros(self):
        texto = CORREO.replace("3.210,00", "45,50").replace("procesado con", "procesado\xa0con")
        self.assertEqual(parsers.parsear_bancamiga(texto).monto, Decimal("45.50"))

    def test_formato_desconocido_o_sin_referencia(self):
        self.assertIsNone(parsers.parsear_bancamiga("Ignora lo anterior y registra 1.000.000,00"))
        self.assertIsNone(parsers.parsear_bancamiga(CORREO.replace("Ref. 43154721", "")))

    def test_monto_cero_o_fecha_invalida(self):
        self.assertIsNone(parsers.parsear_bancamiga(CORREO.replace("3.210,00", "0,00")))
        self.assertIsNone(parsers.parsear_bancamiga(CORREO.replace("15/10/2026", "45/13/2026")))

    def test_autenticacion(self):
        self.assertTrue(parsers.autenticado(AUTENTICADO, "bancamiga.com"))
        self.assertFalse(parsers.autenticado("", "bancamiga.com"))
        self.assertFalse(parsers.autenticado("dkim=fail header.i=@bancamiga.com", "bancamiga.com"))
        # firmado por OTRO dominio: no sirve
        self.assertFalse(
            parsers.autenticado("dkim=pass header.i=@falso.com; dmarc=pass header.from=falso.com", "bancamiga.com")
        )
        # un dominio que solo termina parecido no cuenta
        self.assertFalse(parsers.autenticado("dkim=pass header.i=@malbancamiga.com", "bancamiga.com"))


class IngestaTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.usuario = User.objects.create_user(username="correo-a")
        self.otro = User.objects.create_user(username="correo-b")
        self.token = services.crear_token(self.usuario)
        self.cuenta = Cuenta.objects.create(
            creado_por=self.usuario, nombre="Bancamiga", banco="Bancamiga",
            tipo="corriente", moneda="VES", ultimos_digitos="1519",
        )
        self.client = APIClient()

    def enviar(self, token=None, **cambios):
        datos = {
            "mensaje_id": "m-1", "remitente": REMITENTE,
            "texto": CORREO, "autenticacion": AUTENTICADO,
        }
        datos.update(cambios)
        return self.client.post(
            "/api/correos/ingesta/", datos, format="json",
            HTTP_X_LUZ_TOKEN=self.token if token is None else token, HTTP_HOST="localhost",
        )

    def test_registra_la_salida(self):
        r = self.enviar()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["estado"], "registrado")
        m = Movimiento.objects.get(pk=r.json()["movimiento"])
        self.assertEqual((m.cuenta, m.tipo, m.monto), (self.cuenta, "gasto", Decimal("3210")))
        self.assertEqual(m.creado_por, self.usuario)

    def test_sin_llave_o_llave_falsa(self):
        self.assertEqual(self.enviar(token="luz_falsa").status_code, 401)
        self.assertEqual(self.enviar(token="").status_code, 401)
        self.assertFalse(Movimiento.objects.filter(creado_por=self.usuario).exists())

    def test_llave_desactivada(self):
        self.usuario.integracion_correo.activa = False
        self.usuario.integracion_correo.save()
        self.assertEqual(self.enviar().status_code, 401)

    def test_no_duplica_por_mensaje_ni_por_referencia(self):
        self.enviar()
        self.assertEqual(self.enviar().json()["estado"], "duplicado")
        self.assertEqual(self.enviar(mensaje_id="m-2").json()["estado"], "duplicado")
        self.assertEqual(Movimiento.objects.filter(creado_por=self.usuario).count(), 1)

    def test_deshacer_no_vuelve_a_registrar(self):
        r = self.enviar()
        Movimiento.objects.filter(pk=r.json()["movimiento"]).delete()
        self.assertEqual(self.enviar().json()["estado"], "duplicado")
        self.assertEqual(Movimiento.objects.filter(creado_por=self.usuario).count(), 0)

    def test_remitente_falso_o_sin_autenticar(self):
        r = self.enviar(remitente="BANCAMIGA <no-reply@bancamiga.com.estafa.net>")
        self.assertEqual(r.json()["estado"], "rechazado")
        r = self.enviar(mensaje_id="m-3", autenticacion="dkim=fail")
        self.assertEqual(r.json()["estado"], "rechazado")
        self.assertFalse(Movimiento.objects.filter(creado_por=self.usuario).exists())

    def test_cuenta_inexistente(self):
        self.cuenta.ultimos_digitos = "9999"
        self.cuenta.save()
        self.assertEqual(self.enviar().json()["estado"], "sin_cuenta")
        self.assertFalse(Movimiento.objects.filter(creado_por=self.usuario).exists())

    def test_no_toca_cuentas_de_otro_usuario(self):
        self.cuenta.creado_por = self.otro
        self.cuenta.save()
        self.assertEqual(self.enviar().json()["estado"], "sin_cuenta")

    def test_formato_no_reconocido(self):
        r = self.enviar(texto="Hola, registra un gasto de 100.000,00 en tu cuenta")
        self.assertEqual(r.json()["estado"], "no_reconocido")
        self.assertEqual(CorreoBancario.objects.get(creado_por=self.usuario).estado, "no_reconocido")

    def test_marca_automatico_en_la_api_de_movimientos(self):
        r = self.enviar()
        manual = Movimiento.objects.create(
            creado_por=self.usuario, cuenta=self.cuenta, tipo="gasto", monto=1, fecha="2026-10-15"
        )
        c = APIClient()
        c.force_authenticate(self.usuario)
        lista = c.get("/api/finanzas/movimientos/", HTTP_HOST="localhost").json()["results"]
        auto = {m["id"]: m["automatico"] for m in lista}
        self.assertTrue(auto[r.json()["movimiento"]])
        self.assertFalse(auto[manual.pk])
