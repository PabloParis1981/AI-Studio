# AI Studio

Un entorno de desarrollo asistido por IA inspirado en Google AI Studio. En lugar de Gemini, el motor que construye y modifica tus proyectos es ChatGPT mediante OpenAI API.

## Funciones

- Espacio de trabajo con explorador de archivos, editor de código, chat y vista previa.
- Proyectos React + Vite creados con una estructura funcional.
- ChatGPT puede listar, leer, crear y modificar archivos del proyecto.
- Conversaciones guardadas por proyecto y restauradas al volver a abrirlo.
- Ejecución real de cada aplicación mediante un servidor Vite independiente.
- Instalación automática de dependencias al ejecutar un proyecto.
- Vista previa en vivo y panel de estado del servidor.
- Terminal interactiva para ejecutar comandos dentro de la carpeta del proyecto.
- Exportación del proyecto completo a un archivo ZIP.
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
