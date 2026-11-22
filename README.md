# AI Studio

Un entorno de desarrollo asistido por IA inspirado en Google AI Studio. Permite elegir ChatGPT (OpenAI API) o Gemini (Google Gemini API) como motor de desarrollo, con el mismo proyecto, explorador, editor, terminal, vista previa y herramientas de archivos. Cada conversación conserva el proveedor y modelo seleccionados.

## Funciones

- Espacio de trabajo con explorador de archivos, editor de código, chat y vista previa.
- Proyectos React + Vite creados con una estructura funcional.
- ChatGPT y Gemini pueden listar, leer, crear y modificar archivos del proyecto mediante las mismas herramientas.
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
- Una o ambas claves: OpenAI API y/o Gemini API. Cada proveedor requiere su propia clave y facturación de API.

## Ejecutar en Windows

1. Cloná o descargá este repositorio.
2. Abrí una terminal en la carpeta.
3. Ejecutá `npm install`.
4. Copiá `.env.example` como `.env` y configurá `OPENAI_API_KEY` y/o `GEMINI_API_KEY`, o guardá las claves desde Configuración dentro de la aplicación.
5. Ejecutá `npm run dev`.
6. Abrí http://localhost:3000.

`npm run dev` compila la interfaz y luego inicia el servidor Express. El servidor escucha en `127.0.0.1` y usa el puerto `3000` por defecto (`PORT` permite cambiarlo). Los servidores Vite de vista previa de los proyectos se asignan automáticamente desde el puerto `5180`.

## Configuración

- `OPENAI_API_KEY`: clave privada de OpenAI API, solo en el servidor.
- `OPENAI_MODEL`: modelo de OpenAI a utilizar.
- `GEMINI_API_KEY`: clave privada de Gemini API, solo en el servidor.
- `GEMINI_MODEL`: modelo de Gemini (por defecto `gemini-3.8-flash`).
- `PORT`: puerto del servidor (3000 por defecto).

También podés guardar las claves desde Configuración dentro de la aplicación. Se escriben en el archivo `.env` local, con permisos privados en sistemas compatibles, y nunca se devuelven al navegador. La facturación de las API es independiente de una suscripción a ChatGPT o Google AI Studio.

En el panel del chat podés elegir el proveedor y el modelo para cada conversación. El selector informa si falta configurar la clave.

## Seguridad

- No pegues claves privadas en el chat ni en archivos del proyecto.
- No subas `.env` a GitHub.
- El servidor valida que las conexiones provengan del equipo local y rechaza nombres de host ajenos (protección frente a DNS rebinding).
- Las operaciones que modifican datos rechazan orígenes web externos y solicitudes marcadas como cross-site.
- Las claves y otras variables con nombres sensibles se excluyen del entorno heredado por los procesos de proyectos.
- La terminal y los scripts de los proyectos se ejecutan con los permisos de tu cuenta del sistema. Esto **no es un sandbox**: un proyecto o una dependencia no confiable podría leer o modificar otros archivos a los que tu usuario tenga acceso. Ejecutá únicamente código y dependencias de confianza.
- No publiques ni expongas este servidor en una red o en Internet. Antes de habilitar acceso remoto o multiusuario hacen falta autenticación, aislamiento real de procesos, límites de recursos y una revisión de seguridad específica.

## Integración GitHub

El código fuente de AI Studio está versionado en este repositorio. La sincronización de los proyectos creados desde la interfaz con repositorios GitHub todavía requiere configuración y desarrollo adicional. Importar este repositorio en una vista previa de un entorno externo no inicia automáticamente el servidor Express: las rutas `/api` y el guardado de claves requieren ejecutar el backend de AI Studio en una instalación local.


### Gestión de proyectos

- Renombrar un proyecto sin cambiar su identificador interno.
- Duplicar proyectos para crear una copia independiente de sus archivos.
- Las copias excluyen dependencias instaladas, compilaciones y el historial interno de conversación.
- Los archivos de configuración seguros `.gitignore` y `.env.example` se conservan en el explorador y en las exportaciones.


La importación y duplicación conservan configuraciones de desarrollo habituales (`.gitignore`, `.env.example`, `.github`, `.vscode` y `.husky`) y excluyen `.env`, credenciales, dependencias y carpetas de compilación.


### Pruebas automáticas

Ejecutá `npm test` para comprobar la API local: creación, lectura y escritura de proyectos, recursos binarios, historial, renombrado, duplicación, exclusión de `.env` y protección contra rutas fuera del proyecto. GitHub Actions ejecuta estas pruebas junto con la compilación en cada push a `main`.


### Seguridad del espacio de trabajo

La API de archivos rechaza rutas que atraviesan enlaces simbólicos, no muestra enlaces simbólicos en el explorador y no permite usar una carpeta de proyecto que sea un enlace simbólico. Las pruebas automáticas cubren estos casos. El servidor sigue diseñado para uso local: no lo publiques directamente en Internet sin autenticación, aislamiento de procesos y límites de recursos.


### Terminal y atajos

La terminal incluye accesos directos para instalar dependencias (`npm install`), compilar (`npm run build`), ejecutar pruebas (`npm test`) y limpiar la salida. En el editor, `Ctrl+S` guarda el archivo y `Ctrl+Shift+Enter` inicia la vista previa.


### Límites de archivos en el servidor

El servidor aplica límites aunque se invoque la API directamente: 2 MB para archivos de texto (tanto lectura como escritura) y 7 MB para archivos binarios. Los límites se validan antes de leer o guardar el contenido, y las pruebas automáticas comprueban los rechazos por tamaño.


### Procesos y datos internos

El servidor protege también los archivos internos de configuración e historial del proyecto frente a enlaces simbólicos. Al detener una vista previa, al vencer el tiempo de una tarea o al cerrar AI Studio, intenta cerrar el árbol completo de procesos para evitar servidores hijos huérfanos.
