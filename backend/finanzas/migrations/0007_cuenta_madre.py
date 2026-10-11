from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("finanzas", "0006_cuenta_clase_institucion")]

    operations = [
        migrations.AddField(
            model_name="cuenta",
            name="cuenta_madre",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="tarjetas",
                to="finanzas.cuenta",
            ),
        ),
    ]
