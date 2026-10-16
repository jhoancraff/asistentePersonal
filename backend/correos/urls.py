from django.urls import path

from .api import ingesta, registros

urlpatterns = [
    path("ingesta/", ingesta),
    path("registros/", registros),
]
