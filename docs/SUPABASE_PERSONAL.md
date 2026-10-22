# Activar tu espacio personal

La app ya no usa registro, correo ni Supabase Auth. Se utiliza una sola llave personal, introducida una vez por dispositivo. Las comidas se guardan inmediatamente en el navegador y se sincronizan automáticamente cuando el espacio está conectado. La llave pública de Supabase y la llave personal son distintas.

## 1. Preparar Supabase

Si ya ejecutaste las migraciones 001 y 002, no las repitas. Si es un proyecto nuevo, ejecuta esos dos archivos primero. Después:

1. Ejecuta `supabase/seed.sql` para actualizar los 145 alimentos.
2. Ejecuta `supabase/migrations/202610220003_personal_space.sql` en SQL Editor.
3. En una consulta nueva ejecuta una sola vez:

```sql
select public.configure_nutrition_personal_access();
```

El resultado es tu llave personal de 64 caracteres. Guárdala en tu gestor de contraseñas; no la subas a GitHub ni la pongas en `.env`. En la base de datos solo se conserva su hash. No hace falta crear usuarios, habilitar correo, configurar SMTP ni configurar URLs de acceso.

Si tenías días en la tabla antigua y pertenecían a un solo usuario, la migración conserva esos días automáticamente. Si había varios usuarios, no se mezclan: los datos originales permanecen en `nutrition_daily_plans`.

## 2. Configurar la web

El `.env` local contiene únicamente:

```dotenv
PUBLIC_SUPABASE_URL=https://TU_PROYECTO.supabase.co
PUBLIC_SUPABASE_ANON_KEY=sb_publishable_TU_CLAVE_PUBLICA
```

Reinicia `npm run dev`. No uses una clave secret/service_role en el frontend.

### Publicar en GitHub Pages

El repositorio incluye `.github/workflows/deploy.yml`, que compila y publica la web en cada push a `main`.

1. En GitHub → **Settings → Pages → Build and deployment**, elige **Source: GitHub Actions**.
2. En **Settings → Secrets and variables → Actions → Variables**, crea dos variables de repositorio con los mismos valores del `.env`: `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY`. Son valores públicos (acaban dentro del JavaScript publicado). La llave personal **no** se pone aquí.
3. Haz push a `main` (o lanza el workflow a mano desde **Actions**). La web queda en `https://cristinafq.github.io/Mi-plato/`.

La ruta base `/Mi-plato/` la calcula el workflow automáticamente; en local la app sigue sirviéndose desde `/`.

## 3. Conectar tus dispositivos

Abre la app, pulsa **Conectar dispositivos**, pega la llave personal y pulsa **Conectar**. Se recuerda en ese navegador; no tienes que repetirlo cada vez. Haz lo mismo con la misma llave en el móvil o en otro navegador.

No existe botón para importar comidas: las copias locales se recuperan automáticamente. Los días locales pendientes sin una versión en la nube se suben al conectar. Si un día ya tenía otra versión remota, se conserva la copia local y la app te permite elegir cuál guardar al abrir ese día.

La web sigue necesitando alojamiento para abrirse desde el móvil. `localhost` solo está en tu ordenador.

## 4. Comprobar el guardado

Selecciona una comida y espera **Sincronizado entre dispositivos**. En Table Editor → `nutrition_personal_plans` aparecerá su fecha. Abre la misma fecha desde el otro dispositivo: debe recuperar los ingredientes y cantidades.

**Guardado en este dispositivo** significa guardado local. **Pendiente de sincronizar/conexión** significa que la copia local está a salvo pero falta confirmar el guardado remoto. Un error indica si falta la migración, la llave es incorrecta o cambió el día en otro dispositivo. Puedes seguir usando las comidas sin conexión y reintentar después.

## Cambiar la llave

Si quieres invalidar la llave anterior, ejecuta deliberadamente en SQL Editor:

```sql
select public.configure_nutrition_personal_access(true);
```

No se borran comidas. Cada dispositivo deberá introducir la nueva llave. La función de configuración solo es accesible para administración desde SQL, nunca desde la web.

## Implementación y comprobaciones

Las tablas personales no tienen permisos de lectura/escritura para los roles públicos. Todas las operaciones pasan por funciones que comprueban la llave, validan el catálogo y el documento y controlan la revisión del día. El guardado conserva las restricciones nutricionales de la migración 002. La llave personal no forma parte de las URLs ni del código compilado: se envía por HTTPS en el cuerpo de cada RPC. La clave publishable de Supabase sí es pública y se incluye en el frontend.

La app guarda una copia local en cada edición, serializa las escrituras remotas, reintenta al recuperar conexión y actualiza días sin cambios al volver a la pestaña y cada 30 segundos. No sobrescribe automáticamente un día editado en otro dispositivo.

Las pruebas de interfaz simulan Supabase y comprueban recuperación entre navegadores, migración, conflictos y fallos de red. La migración debe ejecutarse y comprobarse en tu proyecto real antes de dar la sincronización por activada.

Si quieres comprobar también los permisos desde SQL, ejecuta `supabase/tests/personal_space.sql`. Comprueba que el rol público no puede leer tablas ni cambiar la llave, que una llave inválida se rechaza y que una llave válida permite guardar y recuperar sin usuarios. La prueba termina con `ROLLBACK` y restaura la llave y los datos originales. No se ha podido ejecutar aquí porque no hay PostgreSQL instalado ni conexión al proyecto remoto.
