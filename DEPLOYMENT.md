# Publicar AI Studio de forma privada

Este proyecto se publica en Cloud Run con una contraseña propia y almacenamiento de proyectos en un bucket de Cloud Storage.

## Requisitos
- Google Cloud CLI instalado en Windows.
- Un proyecto de Google Cloud con facturación habilitada y permisos para activar servicios, crear buckets y desplegar Cloud Run.
- La clave Gemini API que se quiera usar en la aplicación.

## Publicación en una sola ejecución (PowerShell)
Desde la carpeta del repositorio, ejecutá:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\deploy-cloud-run.ps1
```

El asistente solicita el ID del proyecto de Google Cloud, la región, una contraseña privada y la clave Gemini. Los secretos se guardan en Secret Manager, no en GitHub ni en los archivos de la aplicación. El servicio usa autenticación por contraseña, HTTPS de Cloud Run y una sola instancia para que las sesiones de terminal/vista previa no salten entre instancias.

La aplicación solicita usuario y contraseña mediante el diálogo seguro del navegador (el usuario puede ser cualquier texto; la contraseña es la que se configuró). No compartas esa contraseña.

## Datos y vistas previas
Los proyectos se guardan en el bucket montado en `/mnt/data/projects`. La vista previa de proyectos Vite se sirve a través del mismo servicio y dentro de un iframe aislado. Las claves de proveedores se configuran como secretos del servicio; la pantalla de configuración local no puede escribir secretos cuando la aplicación está publicada.

## Costos
Cloud Run puede escalar a cero, pero Cloud Storage, Secret Manager, compilaciones y uso de Gemini pueden generar cargos. Revisá los precios y límites de tu proyecto de Google Cloud antes de desplegar.
