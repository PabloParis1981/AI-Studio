# AI Studio Personal

Entorno privado de desarrollo asistido por IA para usar desde tu computadora y abrir en Chrome. Incluye dos asistentes locales: ChatGPT mediante Codex CLI y Gemini mediante Gemini CLI. Ambos trabajan directamente sobre los archivos del proyecto activo y comparten editor, terminal y vista previa.

## Qué incluye

- ChatGPT conectado mediante inicio de sesión con tu cuenta ChatGPT (Codex CLI), sin API Key.
- Gemini conectado mediante inicio de sesión con tu cuenta Google (Gemini CLI), sin API Key.
- Los dos asistentes trabajan sobre la misma carpeta del proyecto.
- Explorador de archivos, editor, terminal, proyectos, historial y vista previa Vite.
- Proyectos almacenados localmente en `data/projects`.
- Servidor limitado a `127.0.0.1`: no queda publicado en Internet ni accesible desde otros equipos.

## Requisitos

- Windows 10/11.
- Node.js 20 o superior.
- Cuenta ChatGPT con acceso a Codex. Los límites dependen del plan.
- Cuenta Google personal para el nivel gratuito de Gemini CLI, sujeto a límites de uso y disponibilidad.

## Primera instalación en Windows

1. Descargá este repositorio desde GitHub y descomprimilo.
2. Si ya tenés Node.js 20 o superior, hacé doble clic en `CONFIGURAR-ASISTENTES.bat`. El archivo instala las dependencias, instala ambos asistentes y abre los dos inicios de sesión. En Gemini elegí **Sign in with Google**; cuando termine la autorización, cerrá Gemini con Ctrl+C.
3. Si preferís hacerlo manualmente, abrí PowerShell dentro de la carpeta `AI-Studio` y ejecutá:

   ```powershell
   npm install
   npm run setup:agents
   ```

4. Iniciá sesión en ChatGPT:

   ```powershell
   codex login
   ```

   Se abrirá el navegador para autorizar tu cuenta ChatGPT.

5. Iniciá sesión en Google:

   ```powershell
   gemini
   ```

   Elegí **Sign in with Google** y completá la autorización en el navegador. Cuando termine, podés cerrar la sesión interactiva.

6. Iniciá AI Studio:

   ```powershell
   npm run dev
   ```

7. Abrí [http://localhost:3000](http://localhost:3000) en Chrome.

## Uso diario

Cada vez que quieras trabajar, hacé doble clic en `INICIAR-AI-STUDIO.bat`. Se abre el servidor local y Chrome con la aplicación en `http://localhost:3000`. También podés iniciarlo manualmente desde PowerShell con `npm run dev`.
1. Elegí ChatGPT o Gemini en el selector.
2. Escribí el cambio que necesitás. El asistente modifica los archivos del proyecto.
3. AI Studio intenta iniciar o actualizar la vista previa automáticamente. También podés usar Ejecutar.

No necesitás volver a iniciar sesión en cada uso mientras las sesiones locales sigan vigentes.

## Cómo funciona el acceso gratuito

- **ChatGPT:** Codex CLI inicia sesión con tu cuenta ChatGPT. El uso se rige por los límites del plan de ChatGPT; no usa facturación de OpenAI API.
- **Gemini:** Gemini CLI permite iniciar sesión con una cuenta Google personal y ofrece una cuota gratuita sujeta a límites de Google. Si se alcanza el límite, hay que esperar a que se restablezca; no se activa facturación automáticamente desde esta aplicación.
- Ningún asistente utiliza una API Key guardada en este repositorio.

## Privacidad y seguridad

- AI Studio escucha únicamente en `127.0.0.1` cuando se ejecuta con `npm run dev`.
- No publiques el servidor ni abras el puerto 3000 a Internet.
- Las credenciales OAuth permanecen en los directorios locales de Codex y Gemini CLI, no dentro del repositorio.
- Codex usa el modo `workspace-write` para limitar las modificaciones al proyecto activo.
- Gemini utiliza el modo `auto_edit`: autoriza las ediciones de archivos y no aprueba automáticamente comandos de terminal.
- La terminal de AI Studio ejecuta comandos con los permisos de tu usuario de Windows. Ejecutá únicamente proyectos y dependencias de confianza.

## Importante sobre la versión publicada

La publicación alojada en Google AI Studio no puede acceder a los programas ni a las sesiones guardadas en tu computadora. Para utilizar ChatGPT y Gemini con tus cuentas personales, ejecutá esta versión local y abrí `http://localhost:3000` en Chrome. La aplicación funciona como una página web, pero el motor y los archivos permanecen en tu PC.

## Comandos útiles

- `npm run dev`: compila y abre el servidor local.
- `npm run build`: compila la interfaz.
- `npm test`: ejecuta las pruebas automáticas.
- `npm run setup:agents`: instala Codex CLI y Gemini CLI.
