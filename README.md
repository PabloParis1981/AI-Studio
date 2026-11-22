# AI Studio

Un entorno de desarrollo asistido por IA, inspirado en Google AI Studio, con **ChatGPT/OpenAI como motor de construcción** y el código de cada proyecto bajo tu control.

## Qué incluye

- Espacio de trabajo con explorador de archivos, editor, chat de IA y panel de vista previa.
- Proyectos React + Vite listos para empezar.
- El asistente puede inspeccionar, crear y modificar archivos directamente usando herramientas.
- Ejecución real de cada proyecto mediante su servidor de desarrollo.
- Instalación automática de dependencias al iniciar por primera vez.
- Panel de salida del servidor y controles para ejecutar/detener la vista previa.
- Proyectos guardados en `data/projects`.
- Integración con OpenAI Responses API; la clave permanece en el servidor.

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

El servidor de la aplicación usa el puerto 8787 y Vite usa el 5173. Los servidores de vista previa de los proyectos se asignan automáticamente desde el puerto 5180.

## Seguridad

- Nunca pegues la clave de API en el chat ni en archivos del proyecto.
- No subas `.env` a GitHub.
- `.env`, `node_modules`, `dist` y los proyectos locales están excluidos de Git.
- Esta versión está pensada para ejecutarse localmente. **No la publiques abierta en Internet**: antes hay que agregar autenticación, límites de uso y aislamiento de procesos.

## Motor de IA

El backend usa la API de OpenAI Responses y herramientas de lectura, escritura, listado y ejecución del proyecto. El modelo se configura con `OPENAI_MODEL` y la clave con `OPENAI_API_KEY`.
