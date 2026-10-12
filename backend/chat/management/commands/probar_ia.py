import time

from django.core.management.base import BaseCommand

from chat import proveedores

HERRAMIENTA_PRUEBA = [
    {
        "type": "function",
        "function": {
            "name": "sumar",
            "description": "Suma dos números.",
            "parameters": {
                "type": "object",
                "properties": {"a": {"type": "number"}, "b": {"type": "number"}},
                "required": ["a", "b"],
            },
        },
    }
]


EXCLUIR = ("whisper", "tts", "embedding", "image", "guard", "safeguard", "orpheus", "veo",
           "lyria", "live", "transcribe", "robotics", "aqa", "antigravity", "research", "nano")


class Command(BaseCommand):
    help = "Verifica cada proveedor de IA configurado: conexión, región y tool calling."

    def _sugerir_modelos(self, p):
        ids = [m for m in proveedores.modelos(p) if m and not any(x in m for x in EXCLUIR)]
        if ids:
            self.stdout.write(
                "    Modelos de texto disponibles con tu llave (ajusta "
                f"{'GROQ_MODEL' if p['id'] == 'groq' else 'GEMINI_MODEL'} en backend/.env):"
            )
            for m in ids[:15]:
                self.stdout.write(f"      - {m}")

    def handle(self, *args, **opts):
        lista = proveedores.configurados()
        if not lista:
            self.stdout.write(self.style.ERROR("No hay llaves: define GROQ_API_KEY y/o GEMINI_API_KEY en backend/.env"))
            return
        for p in lista:
            self.stdout.write(f"\n== {p['etiqueta']} · modelo {p['modelo']} ==")
            pruebas = (
                ("conversación", [{"role": "user", "content": "Responde solo: ok"}], []),
                (
                    "herramientas",
                    [{"role": "user", "content": "Usa la herramienta sumar con a=2 y b=3."}],
                    HERRAMIENTA_PRUEBA,
                ),
            )
            for nombre, msgs, tools in pruebas:
                t0 = time.time()
                try:
                    r = proveedores._llamar(p, msgs, tools)
                except proveedores.ErrorProveedor as exc:
                    self.stdout.write(self.style.ERROR(f"  ✗ {nombre}: {exc}"))
                    if "(404)" in str(exc) or "(400)" in str(exc):
                        self._sugerir_modelos(p)
                    continue
                ms = int((time.time() - t0) * 1000)
                if tools and not r["llamadas"]:
                    self.stdout.write(self.style.WARNING(f"  ! {nombre}: respondió pero NO llamó a la herramienta ({ms} ms)"))
                else:
                    self.stdout.write(self.style.SUCCESS(f"  ✓ {nombre} ({ms} ms)"))
