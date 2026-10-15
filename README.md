# Informe diario de Core Web Vitals

GitHub Actions consulta CrUX cada dia a las 07:30 de Espana peninsular (Europe/Madrid), tanto en verano como en invierno, y publica el informe completo como comentario en una issue del repositorio. Incluye LCP, CLS e INP para movil y escritorio, p75, umbrales y periodo de recopilacion. Se publica aunque todas las metricas esten bien, y distingue expresamente la falta de datos.

No hay proveedor de correo, servidor SMTP, aplicacion adicional ni DNS que configurar. La unica API externa es CrUX, la fuente de los datos. El programa usa Node.js y no instala dependencias de terceros.

## Como llega al correo del tecnico

GitHub Actions no ofrece una API para enviar un correo personalizado a una direccion arbitraria. El mecanismo nativo es que el tecnico se suscriba a la issue y habilite las notificaciones por email de GitHub. GitHub envia la notificacion con el contenido del comentario segun las preferencias del destinatario.

Por tanto, el tecnico necesita una cuenta de GitHub, acceso al repositorio y una direccion corporativa verificada en su cuenta. El remitente es GitHub, no una direccion de vuestra organizacion. No se pueden controlar el asunto, la plantilla ni la entrega del correo como con un proveedor SMTP. Si el tecnico no puede suscribirse, el informe seguira disponible en GitHub, pero no habra envio directo a su email.

## 1. Preparar el repositorio

1. Publica estos cambios en la rama predeterminada. Una copia local no activa GitHub Actions.
2. Habilita **Actions** y **Issues** en el repositorio. Para un repositorio privado, concede acceso al tecnico antes de compartir la issue.
3. En **Settings > Secrets and variables > Actions > Variables**, crea `MONITOR_ENABLED=false` mientras pruebas. Las ejecuciones manuales siguen disponibles.
4. No crees claves de correo ni un token personal de GitHub. El workflow recibe automaticamente `GITHUB_TOKEN` con el permiso `issues: write` para publicar en su propio repositorio. Si una politica superior limita ese permiso, GitHub mostrara un error; no hace falta instalar una aplicacion para configurarlo.

## 2. Probar publicacion y notificaciones sin claves

1. Abre **Actions > CrUX Core Web Vitals Daily Report > Run workflow**. Selecciona la rama con los cambios y el modo **demo**.
2. La ejecucion creara o reutilizara una issue titulada **Informe diario de Core Web Vitals** y publicara una prueba marcada claramente, sin consultar CrUX ni inventar medidas. La prueba manual menciona al usuario que la lanza para generar una notificacion dirigida a su cuenta; el registro muestra el enlace al comentario. El email depende de sus preferencias de notificaciones, no de la respuesta de publicacion.
3. Comparte el enlace de la issue con el tecnico. El tecnico pulsa **Subscribe** en la issue.
4. En su cuenta, el tecnico anade y verifica su correo corporativo en **Settings > Emails**. En [Settings > Notifications](https://github.com/settings/notifications), activa **Email** para conversaciones en las que participa o que sigue, habilita notificaciones de comentarios y selecciona esa direccion como correo de notificaciones. No cambies el correo de otra persona desde tu cuenta.
5. Ejecuta **demo** otra vez, despues de la suscripcion, para crear un comentario nuevo. Comprueba la notificacion de GitHub y la llegada al buzon corporativo, incluido spam. La primera prueba anterior a la suscripcion no demuestra la entrega.

Cada ejecucion guarda tambien el informe en el resumen de Actions y como archivos Markdown/JSON descargables en **Artifacts**. Los archivos del artifact se conservan siete dias; los comentarios permanecen en la issue mientras no se borren. Una respuesta correcta de la API solo demuestra publicacion, no recepcion del email.

## 3. Configurar CrUX y probar el informe real

En **Settings > Secrets and variables > Actions > Secrets**, guarda solo:

| Secret | Valor |
| --- | --- |
| `CRUX_API_KEY` | Clave de Google Cloud con Chrome UX Report API habilitada |
| `CRUX_ORIGINS` | Por ejemplo `https://example.com`; varios origenes separados por comas |

Los origenes no admiten rutas. HTTP y HTTPS, o el dominio con y sin `www`, son distintos. No compartas claves en codigo, capturas ni chat. Las antiguas variables y claves `EMAIL_*` ya no se utilizan: puedes retirarlas de GitHub y revocar las claves de los proveedores descartados.

Ejecuta **Run workflow > report**. Comprueba que se publica la tabla completa y que el tecnico recibe la notificacion del nuevo comentario. Si CrUX carece de muestras suficientes, el informe lo indicara: no equivale a una evaluacion favorable.

## 4. Activar, ajustar o detener

- **Activar diarios:** cambia `MONITOR_ENABLED` a `true`. El modo de las ejecuciones programadas siempre es el informe real. Comprueba la primera ejecucion programada y su notificacion.
- **Horario:** edita `cron: '30 7 * * *'` con `timezone: 'Europe/Madrid'` en [.github/workflows/cwb-monitor.yml](.github/workflows/cwb-monitor.yml). Se programa a las 07:30 de Espana peninsular todo el ano; la zona horaria ajusta automaticamente el cambio de hora (05:30 UTC en verano y 06:30 UTC en invierno). GitHub puede retrasar la ejecucion y no garantiza el minuto exacto.
- **Web o dispositivos:** actualiza el secret `CRUX_ORIGINS` o la variable `CRUX_DEVICES` (por defecto `MOBILE,DESKTOP`).
- **Umbrales opcionales:** `MAX_LCP=2500` ms, `MAX_CLS=0.1`, `MAX_INP=200` ms. Marcan excesos, pero no condicionan la publicacion.
- **Issue opcional:** la variable `REPORT_ISSUE_NUMBER` permite elegir una issue existente por su numero. Si queda vacia, el programa localiza la issue mediante su marcador interno o crea una nueva. No borres el marcador del cuerpo. Una issue cerrada se reabre; cerrarla no pausa la automatizacion.
- **Pausar automaticos:** `MONITOR_ENABLED=false`. Las ejecuciones manuales siguen permitidas.
- **Detener todo:** **Disable workflow** en el menu de Actions. Cancela por separado una ejecucion ya iniciada.
- **Costes:** no hay cuota de un proveedor de correo. Los minutos y el almacenamiento de Actions estan sujetos al plan y presupuesto de tu cuenta de GitHub; no se promete coste cero para cualquier cuenta.

Los errores de CrUX o de publicacion hacen fallar la ejecucion. Si falla la API de GitHub despues de generar el informe, el resumen y los archivos siguen disponibles. Configura tambien las notificaciones de fallos de Actions.

## Prueba local

Necesitas Node.js 24 LTS; no hacen falta paquetes npm ni navegador. Ejecuta `npm test` para las pruebas automaticas con respuestas simuladas, sin peticiones ni publicaciones reales.

- `npm run demo`: genera una prueba local sin claves en `reports/core-web-vitals.md` y `reports/core-web-vitals.json`.
- `npm run start:local`: consulta CrUX con las variables de tu archivo `.env`; usa [.env.example](.env.example) como referencia. No sobrescribas un archivo de entorno existente. Sin `GITHUB_TOKEN` y `GITHUB_REPOSITORY`, solo guarda archivos locales.
- Las carpetas de informes y el archivo de entorno quedan excluidos de Git. Nunca subas las claves ni el entorno como artifact.

CrUX agrega datos sobre una ventana de 28 dias, se actualiza diariamente y suele llevar unos dos dias de retraso. No es monitorizacion en tiempo real. No se garantiza un email a una hora exacta ni deduplicacion entre ejecuciones manuales. Esta copia local no publica cambios ni demuestra entrega real: la aceptacion requiere una prueba en GitHub y la confirmacion del destinatario.

Documentacion oficial: [GITHUB_TOKEN](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token) y [configuracion de notificaciones](https://docs.github.com/en/subscriptions-and-notifications/get-started/configuring-notifications).