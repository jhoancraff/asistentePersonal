from django.db import migrations, models


def completar(apps, schema_editor):
    Cuenta = apps.get_model("finanzas", "Cuenta")
    Cuenta.objects.filter(tipo="billetera").update(clase_institucion="billetera")
    Cuenta.objects.filter(tipo="cripto").update(clase_institucion="cripto")


class Migration(migrations.Migration):
    dependencies = [("finanzas", "0005_sembrar_proveedores")]

    operations = [
        migrations.AddField(
            model_name="cuenta",
            name="clase_institucion",
            field=models.CharField(default="banco", max_length=10),
        ),
        migrations.RunPython(completar, migrations.RunPython.noop),
    ]
