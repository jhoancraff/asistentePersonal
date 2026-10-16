/**
 * Luz · lector de notificaciones bancarias de Gmail (Google Apps Script).
 *
 * Revisa tu Gmail cada minuto, toma SOLO los correos nuevos del banco y se los envía a Luz,
 * que registra la salida en tu cuenta. El script no modifica ni borra tus correos.
 *
 * CONFIGURACIÓN (Proyecto → Configuración → Propiedades del script). No pongas valores aquí:
 *   LUZ_URL    → https://luz.varagrilladmin.com   (sin barra final)
 *   LUZ_TOKEN  → la llave que muestra:  python manage.py crear_token_correo --usuario TU_USUARIO
 *   LUZ_DESDE_DIAS (opcional) → cuántos días atrás leer en la PRIMERA ejecución (por defecto 0:
 *                    solo correos nuevos desde que instalas el script).
 *
 * INSTALACIÓN: ver README.md, sección «Correos bancarios».
 */

const REMITENTES = ['no-reply@bancamiga.com']; // debe coincidir con CORREO_REMITENTES_PERMITIDOS
const ETIQUETA_REVISAR = 'Luz-revisar'; // correos que Luz no supo interpretar
const MAX_POR_EJECUCION = 25;
const MAX_CARACTERES = 15000;

/** Función que ejecuta el disparador cada minuto. */
function revisarCorreos() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return; // otra ejecución sigue en curso

  try {
    const props = PropertiesService.getScriptProperties();
    const url = (props.getProperty('LUZ_URL') || '').replace(/\/+$/, '');
    const token = props.getProperty('LUZ_TOKEN');
    if (!url || !token) throw new Error('Faltan LUZ_URL o LUZ_TOKEN en las Propiedades del script.');

    let desde = Number(props.getProperty('ULTIMO_MS'));
    if (!desde) {
      const dias = Number(props.getProperty('LUZ_DESDE_DIAS') || 0);
      desde = Date.now() - dias * 24 * 3600 * 1000;
      props.setProperty('ULTIMO_MS', String(desde));
    }

    const consulta =
      'from:(' + REMITENTES.join(' OR ') + ') after:' + Math.floor(desde / 1000 - 3600);
    const mensajes = [];
    GmailApp.search(consulta, 0, 50).forEach(function (hilo) {
      hilo.getMessages().forEach(function (m) {
        if (m.getDate().getTime() > desde) mensajes.push(m);
      });
    });
    mensajes.sort(function (a, b) { return a.getDate() - b.getDate(); });

    let ultimo = desde;
    for (const m of mensajes.slice(0, MAX_POR_EJECUCION)) {
      const resultado = enviarALuz(url, token, m);
      if (resultado === null) break; // fallo de red/servidor: se reintenta en la próxima ejecución
      if (resultado.estado === 'no_reconocido') etiquetar(m, ETIQUETA_REVISAR);
      ultimo = Math.max(ultimo, m.getDate().getTime());
      props.setProperty('ULTIMO_MS', String(ultimo));
      console.log(m.getId() + ' → ' + resultado.estado + (resultado.detalle ? ' (' + resultado.detalle + ')' : ''));
    }
  } finally {
    lock.releaseLock();
  }
}

function enviarALuz(url, token, mensaje) {
  const cabeceras = cabecerasCrudas(mensaje);
  const carga = {
    mensaje_id: idMensaje(cabeceras, mensaje),
    remitente: mensaje.getFrom(),
    texto: mensaje.getPlainBody().slice(0, MAX_CARACTERES),
    autenticacion: cabecera(cabeceras, 'Authentication-Results'),
  };
  try {
    const r = UrlFetchApp.fetch(url + '/api/correos/ingesta/', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-Luz-Token': token },
      payload: JSON.stringify(carga),
      muteHttpExceptions: true,
    });
    const codigo = r.getResponseCode();
    if (codigo === 200) return JSON.parse(r.getContentText());
    if (codigo === 401) throw new Error('Luz rechazó la llave (LUZ_TOKEN). Genera una nueva.');
    console.warn('Luz respondió ' + codigo + '; se reintentará.');
    return null;
  } catch (e) {
    if (String(e).indexOf('LUZ_TOKEN') !== -1) throw e;
    console.warn('No se pudo contactar a Luz: ' + e);
    return null;
  }
}

/** Cabeceras del correo (hasta la primera línea en blanco), con las líneas plegadas unidas. */
function cabecerasCrudas(mensaje) {
  return mensaje.getRawContent().split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]+/g, ' ');
}

/** Valor de la PRIMERA cabecera con ese nombre (para Authentication-Results es la que anotó Gmail). */
function cabecera(cabeceras, nombre) {
  const m = cabeceras.match(new RegExp('^' + nombre + ':\\s*(.*)$', 'im'));
  return m ? m[1] : '';
}

/**
 * Identificador del correo: el Message-ID estándar es único en el mundo y se conserva al reenviar
 * entre buzones; así el mismo correo no se registra dos veces aunque llegue por varias cuentas.
 */
function idMensaje(cabeceras, mensaje) {
  return cabecera(cabeceras, 'Message-ID').trim() || mensaje.getId();
}

function etiquetar(mensaje, nombre) {
  const etiqueta = GmailApp.getUserLabelByName(nombre) || GmailApp.createLabel(nombre);
  mensaje.getThread().addLabel(etiqueta);
}

/** Ejecútala UNA vez para crear el disparador de cada minuto. */
function instalarDisparador() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'revisarCorreos'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('revisarCorreos').timeBased().everyMinutes(1).create();
}

/** Prueba manual: ejecútala para ver en el registro qué haría, sin esperar al disparador. */
function probar() {
  revisarCorreos();
}
