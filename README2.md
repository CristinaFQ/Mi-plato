# Mi plato — estado actual y próximos pasos

Resumen para retomar el proyecto desde cualquier dispositivo. Última actualización: 22/10/2026.

## Estado: versión 1 cerrada ✅

- **Web publicada:** https://cristinafq.github.io/Mi-plato/
- **Repositorio:** https://github.com/CristinaFQ/Mi-plato
- **Publicación:** automática con cada push a `main` (`.github/workflows/deploy.yml`). Progreso en https://github.com/CristinaFQ/Mi-plato/actions
- **Datos:** se guardan al momento en el navegador y se sincronizan con Supabase entre todos tus dispositivos.

## Cómo funciona el acceso

- No hay registro ni correo: hay **una llave personal** de 64 caracteres, generada en Supabase.
- Se introduce **una vez por navegador**: botón **Conectar dispositivos** → pegar la llave → **Conectar**. Cuando está conectado, el botón pasa a llamarse **Mis dispositivos**.
- En modo incógnito hay que volver a pegarla cada vez, porque al cerrar la ventana se borra todo.
- La llave está guardada en el gestor de contraseñas. **Nunca** se sube a GitHub ni se pone en `.env`.

### Si la llave se pierde o deja de funcionar

En Supabase → **SQL Editor**, ejecuta **una sola vez**:

```sql
select public.configure_nutrition_personal_access(true);
```

Copia el resultado (64 caracteres, solo `0-9` y `a-f`) y vuelve a conectar cada dispositivo. No se borra ninguna comida, pero la llave anterior deja de valer.

## Configuración (ya hecha)

- **Supabase:** migraciones 001, 002 y 003 y seed ejecutados; llave generada.
- **GitHub → Settings → Pages:** Source = **GitHub Actions**.
- **GitHub → Settings → Secrets and variables → Actions → Variables:**
  - `PUBLIC_SUPABASE_URL`: URL del proyecto. La app acepta también la forma con `/rest/v1/` al final.
  - `PUBLIC_SUPABASE_ANON_KEY`: clave *anon* o *publishable*. Es pública; nunca uses la *secret* ni la *service_role*.
- **Local (opcional):** crear `.env` con esas dos mismas líneas para que `npm run dev` también sincronice. El `.env` no se sube a GitHub.

## Cambios de esta sesión

1. Publicación en GitHub Pages: workflow nuevo y ruta base `/Mi-plato/` en `astro.config.mjs`.
2. Las rutas del catálogo de alimentos respetan la ruta base (`src/lib/repository.js`).
3. La URL de Supabase se limpia si lleva `/rest/v1/` (`src/lib/supabase.js`). Esto causaba el error `PGRST125`.
4. Los errores de sincronización muestran el código y el detalle de Supabase (`src/lib/personal.js`).
5. Banner móvil de calorías y macros: solo aparece al bajar más allá del resumen, no se muestra en **Alimentos** y deja pasar los toques (`src/components/Planner.jsx`, `src/styles/visual.css`).

## Problemas conocidos

- Hay **2 tests de interfaz** que fallan en Windows (`tests/ui.test.mjs`, por cómo esbuild resuelve las rutas). Ya fallaban antes y no afectan a la web: 57 de 59 pasan.

## Próximos pasos

1. **Pulir** la app: diseño, detalles de uso y arreglar los 2 tests.
2. **Generalizar:** pasar de una llave personal única a cuentas de usuario (varios usuarios, cada uno con sus datos).

## Retomar en otro ordenador

```sh
git clone https://github.com/CristinaFQ/Mi-plato.git
cd Mi-plato
npm ci
npm run dev   # http://localhost:5173
```

Requiere Node.js 22.12 o superior. Guía detallada de Supabase: [docs/SUPABASE_PERSONAL.md](docs/SUPABASE_PERSONAL.md).
