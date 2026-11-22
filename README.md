# AI Studio

Tu espacio propio para crear aplicaciones con asistencia de IA, con el código bajo tu control.

## Estado actual

Primera base funcional en construcción:
- Interfaz de trabajo con explorador de archivos, editor, vista previa HTML y chat.
- Proyectos y archivos guardados en el servidor.
- Asistente conectado a OpenAI mediante la API de Responses y herramientas para leer, listar y escribir archivos.
- La clave de OpenAI se lee desde el entorno del servidor y no se envía al navegador.

## Requisitos

- Node.js 20 o superior
- Una clave de API de OpenAI con facturación de API habilitada para usar el asistente

## Ejecutar en Windows

1. Descargá o cloná este repositorio.
2. Abrí una terminal en la carpeta del proyecto.
3. Ejecutá `npm install`.
4. Copiá `.env.example` como `.env` y agregá tu clave en `OPENAI_API_KEY`.
5. Ejecutá `npm run dev`.
6. Abrí la dirección local que muestra Vite (normalmente http://localhost:5173).

El servidor de la API usa el puerto 8787 por defecto.

## Seguridad

- No compartas tu clave por el chat.
- No subas `.env` a GitHub.
- Los proyectos creados se guardan en `data/projects`, que está excluida de Git.

## Próximas etapas

1. Ejecución real de proyectos y vista previa con servidor de desarrollo.
2. Terminal controlada y salida de ejecución.
3. Sincronización GitHub por proyecto.
4. Exportación ZIP y publicación.
5. Mejoras del editor, historial y gestión de cambios.

La terminal, publicación y sincronización GitHub todavía no están implementadas en esta primera etapa.
