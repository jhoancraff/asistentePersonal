from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from tempfile import TemporaryDirectory
from django.test import override_settings
from rest_framework.test import APIClient

from .models import Conversacion, Mensaje


class AudioMensajeTests(TestCase):
    def setUp(self):
        self.media_dir = TemporaryDirectory()
        self.addCleanup(self.media_dir.cleanup)
        self.media_settings = override_settings(MEDIA_ROOT=self.media_dir.name)
        self.media_settings.enable()
        self.addCleanup(self.media_settings.disable)

        self.usuario = get_user_model().objects.create_user(username="luz-audio")
        self.otro_usuario = get_user_model().objects.create_user(username="otro-audio")
        conversacion = Conversacion.objects.create(usuario=self.usuario)
        self.mensaje = Mensaje.objects.create(
            conversacion=conversacion,
            audio=SimpleUploadedFile("nota.webm", b"audio privado", content_type="audio/webm"),
        )
        self.url = f"/api/chat/audio/{self.mensaje.pk}/"

    def test_owner_can_download_audio(self):
        client = APIClient()
        client.force_authenticate(self.usuario)

        response = client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(b"".join(response.streaming_content), b"audio privado")
        self.assertEqual(response["Cache-Control"], "private, no-store")

    def test_other_user_cannot_download_audio(self):
        client = APIClient()
        client.force_authenticate(self.otro_usuario)

        self.assertEqual(client.get(self.url).status_code, 404)

    def test_anonymous_user_cannot_download_audio(self):
        self.assertEqual(APIClient().get(self.url).status_code, 401)
