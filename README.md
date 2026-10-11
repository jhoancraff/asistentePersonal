# Luz

Asistente personal: finanzas, agenda, notas y notificaciones. PWA con backend Django y frontend React.

- **Backend:** Django 6 + Django REST Framework + JWT, PostgreSQL
- **Frontend:** React + Vite (JavaScript), PWA con `vite-plugin-pwa`, Web Push
- **Chat con IA/voz:** pendiente. El código ya está preparado (ver "Arquitectura").

## Puesta en marcha

### 1. Base de datos (una sola vez, como superusuario `postgres`)

```sql
CREATE USER <DB_USER> WITH PASSWORD '<DB_PASSWORD>';
CREATE DATABASE <DB_NAME> OWNER <DB_USER>;
```

### 2. Backend

```bash
python -m venv venv
venv\Scripts\activate            # Windows
pip install -r backend/requirements.txt
cd backend
copy .env.example .env            # y completa los valores
python manage.py generar_vapid    # copia las llaves a .env
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver        # http://localhost:8000
python manage.py runscheduler     # en otra terminal: recordatorios
```

### 3. Frontend

```bash
cd frontend
copy .env.example .env
npm install
npm run dev                       # http://localhost:5173
```

## Catálogo de instituciones (bancos, billeteras, exchanges)

- `python manage.py migrate` siembra un catálogo curado (Venezuela, Colombia, EE. UU., Panamá,
  España, Zelle, Zinli, PayPal, Binance, etc.). Se puede refrescar con
  `python manage.py sembrar_proveedores`.
- Bancos de todo el mundo (opcional): `python manage.py importar_bancos --descargar`
  (dataset BIC/SWIFT de [OpenSanctions](https://www.opensanctions.org/datasets/iso9362_bic/),
  licencia **CC BY-NC 4.0: solo uso no comercial**, ~19 MB). Acepta `--pais CO --pais US`.
- Lo que escribas a mano ("Otro…") queda guardado para tu usuario.

## Agente de IA (fase 1: texto)

Chat con herramientas sobre tus finanzas, agenda y notas. Proveedores gratuitos, en orden:
**Groq** → **Gemini** (si uno falla por límite o red, usa el siguiente).

1. Crea una llave en <https://console.groq.com/keys> (y opcionalmente en <https://aistudio.google.com/apikey>).
2. Ponla en `backend/.env`: `GROQ_API_KEY=...` (y `GEMINI_API_KEY=...`) y reinicia el servidor.
3. Verifica: `python manage.py probar_ia` (conexión, región y tool calling por proveedor).

Seguridad:
- **Consultar** es libre. **Crear, editar o eliminar** siempre queda como acción pendiente y solo se
  ejecuta cuando confirmas con el botón (expira a los 15 min).
- Las notas seguras cifradas y las notas sensibles **no** están al alcance del agente.
- Los datos que se envían al proveedor son solo los necesarios (sin documento, correo ni titular).
- Las herramientas viven en `backend/chat/herramientas.py`; el bucle del agente en `chat/agente.py`.

## Notas seguras (cifradas)

Las notas ancladas a una cuenta (claves, preguntas de seguridad) se guardan **cifradas**
con AES-256-GCM; la base de datos solo contiene `enc:v1:...`.

- La clave vive en `backend/.env` (`FIELD_ENCRYPTION_KEYS`), **no** en la base de datos ni en git.
  Genérala con `python manage.py generar_clave_cifrado`.
- **Respalda esa clave** (gestor de contraseñas). Si se pierde, las notas no se pueden recuperar.
- Rotación: pon la clave nueva primero (`k2:...,k1:...`) y ejecuta `python manage.py rotar_cifrado`.
- Estas notas no se exponen al futuro agente de IA (no están registradas con `@accion`).

## Probar desde el teléfono (misma red Wi-Fi)

1. Averigua la IP de tu PC con `ipconfig` (ej. `192.168.X.X`).
2. En `backend/.env` añade esa IP:
   `DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,192.168.X.X`
   `CORS_ALLOWED_ORIGINS=http://localhost:5173,http://192.168.X.X:5173`
3. Backend expuesto a la red: `python manage.py runserver 0.0.0.0:8000`
4. Frontend: `npm run dev` (Vite ya escucha en la red: `server.host = true`).
5. Abre `http://192.168.X.X:5173` en el teléfono. La API se deduce del host
   (`http://<host>:8000/api`); no hace falta tocar `VITE_API_URL`.
6. Windows: permite los puertos 5173 y 8000 en el firewall (perfil de red Privada).

> Service worker, notificaciones push y micrófono requieren HTTPS; por HTTP+IP no funcionan.

## Arquitectura

| Capa | Dónde | Para qué |
|---|---|---|
| Modelo base | `core.models.AuditModel` | Toda tabla hereda `creado_por`, `fecha_creacion`, `actualizado_por`, `fecha_actualizacion` |
| Servicios | `<app>/services.py` | Única vía para crear/editar/eliminar/consultar; la usan la API y, a futuro, el agente |
| Registro de acciones | `core.registry` | Catálogo (`@accion`) de funciones que la IA podrá invocar |
| API | `<app>/api.py`, `urls.py` | Endpoints REST bajo `/api/...` |
| Chat | `chat` | Conversaciones y mensajes con texto + audio, listo para conectar al agente |

Apps: `core`, `finanzas`, `agenda`, `notas`, `notificaciones`, `chat`.

## Seguridad

- Los secretos viven en `backend/.env` y `frontend/.env`, **ignorados por git**. Solo se versionan los `.env.example`.
- No subir dumps de BD, llaves (`*.pem`, `*.key`) ni la carpeta `media/`.
