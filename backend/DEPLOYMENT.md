# Producción en la red local

Gunicorn sirve Django solo por `127.0.0.1:18000`. Nginx sirve la build de React, la API y
los archivos estáticos por el puerto `18480`; no se modifican los sitios ni puertos de Seven.
Los archivos de audio se entregan por un endpoint autenticado de la API, no como ficheros
públicos.

## Preparar y verificar

Desde la raíz del repositorio:

```bash
backend/venv/bin/pip install -r backend/requirements.txt
cd backend
venv/bin/python manage.py check --deploy
venv/bin/python manage.py migrate --check
venv/bin/python manage.py collectstatic --noinput
cd ../frontend
VITE_API_URL=/api npm run build
```

`check --deploy` advierte que Django no redirige HTTPS globalmente. Esto es intencional para
mantener HTTP en la LAN; Nginx redirige a HTTPS las solicitudes públicas cuando Cloudflare
marca `X-Forwarded-Proto: http`.

## Activar Gunicorn

Desde la cuenta `sevens`:

```bash
systemctl --user link /home/asistentePersonal/backend/luz-gunicorn.service
systemctl --user daemon-reload
systemctl --user enable --now luz-gunicorn
```

## Activar Nginx

El archivo `backend/deploy/nginx-luz.conf` es un bloque de servidor independiente. Con
permisos administrativos, instálalo y valida la configuración antes de recargar el servicio:

```bash
sudo ln -s /home/asistentePersonal/backend/deploy/nginx-luz.conf /etc/nginx/sites-available/luz
sudo ln -s /etc/nginx/sites-available/luz /etc/nginx/sites-enabled/luz
sudo nginx -t
sudo systemctl reload nginx
```

Permite el puerto `18480` solo desde la subred local en el firewall. Abre
`http://192.168.7.24:18480/`.

## Dominio y HTTPS de Cloudflare

`luz.varagrilladmin.com` se publica detrás de Cloudflare. Cloudflare debe tener una ruta
del túnel a `http://127.0.0.1:18480`; sus solicitudes deben incluir `X-Forwarded-Proto`.
Nginx conserva el protocolo HTTPS del visitante para Django y redirige a HTTPS las
solicitudes públicas que lleguen como HTTP. El túnel cifra el tramo entre Cloudflare y el
conector; Nginx emite HSTS en la aplicación, API y recursos estáticos. No publiques `18480`
directamente en Internet.

Para disponibilidad tras reinicios, configura un **Named Tunnel** en Cloudflare con el
hostname `luz.varagrilladmin.com` y el origen `http://127.0.0.1:18480`. Instala el conector
Linux como servicio del sistema usando el comando/token que entrega Cloudflare. No pongas el
token en el repositorio ni lo compartas. `cloudflared tunnel --url ...` es un Quick Tunnel
temporal: su URL cambia y no sustituye al Named Tunnel de producción.

La red local sigue disponible por HTTP en `http://192.168.7.24:18480/`. En consecuencia,
`DJANGO_SECURE_SSL_REDIRECT=False` es intencional; el redireccionamiento público lo hace
Nginx usando el protocolo que comunica Cloudflare.

Los valores aplicados en `backend/.env` son `DJANGO_SESSION_COOKIE_SECURE=True`,
`DJANGO_CSRF_COOKIE_SECURE=True` y `DJANGO_HSTS_SECONDS=31536000`.

No actives `DJANGO_SECURE_SSL_REDIRECT=True` mientras se conserve el acceso directo por HTTP
de la LAN; eso redirigiría también a los usuarios locales. Nunca publiques el puerto Gunicorn
(`18000`) directamente. Añade al firewall `18480` solo desde la subred local; Cloudflare
Tunnel debe alcanzar el origen local por loopback.
