from django.db import migrations

from finanzas.seed import sembrar


def cargar(apps, schema_editor):
    sembrar(apps.get_model("finanzas", "Proveedor"))


class Migration(migrations.Migration):
    dependencies = [("finanzas", "0004_proveedores_internacional")]

    operations = [migrations.RunPython(cargar, migrations.RunPython.noop)]
