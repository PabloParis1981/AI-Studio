# Publicar AI Studio de forma privada

La publicación recomendada es Google Cloud Run con contraseña privada, HTTPS y almacenamiento persistente en Cloud Storage.

## Pasos desde el navegador (sin instalar nada en tu PC)

1. Abrí [Google Cloud Shell](https://shell.cloud.google.com/) con la misma cuenta de Google que usás para Cloud.
2. Seleccioná o creá un proyecto de Google Cloud con facturación habilitada.
3. En Cloud Shell ejecutá estos comandos:

```bash
git clone https://github.com/PabloParis1981/AI-Studio.git
cd AI-Studio
bash deploy-cloud-run.sh
```

Si el repositorio es privado, primero autenticá GitHub en Cloud Shell y después repetí el `git clone`.

4. El asistente te va a pedir:
   - ID del proyecto de Google Cloud (si todavía no está seleccionado).
   - Región (dejá `southamerica-east1` para São Paulo).
   - Nombre del bucket donde se guardarán tus proyectos.
   - Una contraseña privada de al menos 16 caracteres.
   - Tu clave `GEMINI_API_KEY` (se ingresa de forma oculta).

El script activa los servicios necesarios, crea el bucket, guarda la contraseña y la clave Gemini en Secret Manager, asigna permisos al servicio y publica la aplicación. No guarda secretos en GitHub ni en los archivos del proyecto.

## Al terminar

Cloud Run mostrará una URL. Abrila en el navegador: te pedirá la contraseña privada. El nombre de usuario puede ser cualquier texto; usá la contraseña que acabás de crear.

Los proyectos se guardan en el bucket montado en `/mnt/data/projects`. El servicio se configura con una sola instancia para mantener las sesiones de terminal y vista previa dentro de la misma instancia.

## Costos

Cloud Run puede escalar a cero, pero Cloud Storage, Secret Manager, compilaciones y uso de Gemini pueden generar cargos. Google Cloud puede requerir una cuenta de facturación activa. Revisá los precios y límites de tu proyecto antes de desplegar.
