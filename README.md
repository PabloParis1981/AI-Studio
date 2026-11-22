# AI Studio

Un entorno de desarrollo asistido por IA inspirado en Google AI Studio. En lugar de Gemini, el motor que construye y modifica tus proyectos es ChatGPT mediante OpenAI API.

## Funciones

- Espacio de trabajo con explorador de archivos, editor de código, chat y vista previa.
- Proyectos React + Vite creados con una estructura funcional.
- ChatGPT puede listar, leer, crear y modificar archivos del proyecto.
- Conversaciones guardadas por proyecto y restauradas al volver a abrirlo.
- Ejecución real de cada aplicación mediante un servidor Vite independiente.
- Instalación automática de dependencias al ejecutar un proyecto, con límite de tiempo.
- Vista previa en vivo que espera a que el servidor responda antes de marcarse como iniciada.
- Guardado automático del editor después de una breve pausa, además del guardado manual.
- Protección de cambios pendientes al ejecutar la aplicación o cambiar de proyecto.
- Terminal interactiva para ejecutar comandos dentro de la carpeta del proyecto.
- Importación y exportación ZIP del proyecto, con soporte para recursos binarios y exclusión de archivos sensibles.
- La vista previa consulta el estado del servidor cuando tarda más de lo habitual.
- Archivos y proyectos guardados localmente en `data/projects`.

## Requisitos

- Node.js 20 o superior.
- Una clave de API de OpenAI con facturación de API habilitada. La suscripción de ChatGPT no incluye crédito de API.

## Ejecutar en Windows

1. Cloná o descargá este repositorio.
2. Abrí una terminal en la carpeta.
3. Ejecutá `npm install`.
4. Copiá `.env.example` como `.env` y configurá `OPENAI_API_KEY`.
5. Ejecutá `npm run dev`.
6. Abrí http://localhost:5173.

El servidor de la aplicación usa el puerto 8787. Los servidores de vista previa de los proyectos se asignan automáticamente desde el puerto 5180.

## Configuración

- `OPENAI_API_KEY`: clave privada de API, solo en el servidor.
- `OPENAI_MODEL`: modelo de OpenAI a utilizar.
- `PORT`: puerto del servidor (8787 por defecto).

## Seguridad

- No pegues claves privadas en el chat ni en archivos del proyecto.
- No subas `.env` a GitHub.
- Los servidores locales escuchan en loopback y no están pensados para exponerse a Internet.
- La terminal ejecuta comandos dentro de la carpeta del proyecto. Usala solo con proyectos y dependencias de confianza.
- Antes de desplegar este entorno para varios usuarios, hay que implementar autenticación, límites de uso y aislamiento de procesos.

## Integración GitHub

El código fuente de AI Studio está versionado en este repositorio. La sincronización de los proyectos creados desde la interfaz con repositorios GitHub todavía requiere configuración y desarrollo adicional.


### Gestión de proyectos

- Renombrar un proyecto sin cambiar su identificador interno.
- Duplicar proyectos para crear una copia independiente de sus archivos.
- Las copias excluyen dependencias instaladas, compilaciones y el historial interno de conversación.
- Los archivos de configuración seguros `.gitignore` y `.env.example` se conservan en el explorador y en las exportaciones.


La importación y duplicación conservan configuraciones de desarrollo habituales (`.gitignore`, `.env.example`, `.github`, `.vscode` y `.husky`) y excluyen `.env`, credenciales, dependencias y carpetas de compilación.


### Pruebas automáticas

Ejecutá `npm test` para comprobar la API local: creación, lectura y escritura de proyectos, recursos binarios, historial, renombrado, duplicación, exclusión de `.env` y protección contra rutas fuera del proyecto. GitHub Actions ejecuta estas pruebas junto con la compilación en cada push a `main`.
