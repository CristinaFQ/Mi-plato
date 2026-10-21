# Mi plato — Astro + React + Supabase

Planificador personal con catálogo estricto, recetas A/B, café por ingredientes, cálculos reactivos, cena elegida por alimentos con proteína restante y guardado por cuenta y fecha.

## Arrancar

Requiere Node.js 22.12+. Desde la carpeta del repositorio:

```sh
npm ci
npm run dev
```

Abre http://localhost:5173. Detén primero el servidor Python antiguo con Ctrl+C si ocupaba ese puerto. No hace falta iniciar Python para la versión nueva.

```sh
npm test
npm run check
npm run build
npm run preview
```

La salida de producción está en `build/`. `python3 server.py` sirve esta misma versión compilada desde `build/` y exige ejecutar antes `npm run build`. La interfaz antigua de `dist/` solo se abre expresamente con `npm run dev:legacy` para diagnóstico.

## Activar Supabase y persistencia entre dispositivos

La integración está preparada; en este entorno no se ha facilitado un proyecto ni su configuración y no se han ejecutado cambios remotos.

1. Usa un proyecto Supabase y ejecuta una vez `supabase/migrations/202610210001_planner.sql` en su editor SQL.
2. Ejecuta también `supabase/migrations/202610210002_ingredient_labels.sql` por compatibilidad con pesos por unidad y planes anteriores. Después ejecuta `supabase/seed.sql` en el editor SQL. Solo importa los 145 alimentos autorizados. `npm run seed:sql` regenera este archivo desde el JSON.
3. Copia `.env.example` a `.env` en la raíz del repositorio y completa:

   ```dotenv
   PUBLIC_SUPABASE_URL=https://TU_PROYECTO.supabase.co
   PUBLIC_SUPABASE_ANON_KEY=TU_CLAVE_PUBLICA
   ```

   Utiliza la clave pública anon/publicable, nunca una clave secret o service_role. `.env` está excluido de Git. Reinicia Astro después de cambiarla; para alojamiento estático, vuelve a compilar.
4. En Supabase Auth habilita el acceso por correo y añade `http://localhost:5173` y la URL publicada a las redirecciones permitidas.
5. Abre «Guardar en mi cuenta», introduce tu correo y abre el enlace recibido. Usa **la misma cuenta** en cada navegador y dispositivo.
6. Espera a ver «Guardado en tu cuenta» antes de cerrar. «Guardando…», «Sin sincronizar» y «Guardado en este dispositivo» no significan que el plan ya esté en la nube.

### Datos y aislamiento

- `nutrition_foods`: catálogo de solo lectura para el cliente; no permite altas desde la app. La lista de IDs permitidos también se comprueba en el cliente.
- `nutrition_daily_plans`: documento con ingredientes separados, cantidades y unidades de sus fichas, recetas elegidas, preferencias de café, objetivos y fecha; clave compuesta `(user_id, plan_date)`.
- RLS limita las lecturas a la cuenta propietaria. Las escrituras solo pasan por `save_nutrition_daily_plan`, que comprueba sesión, alimentos, unidades de cantidad, fruta y cena.
- Guardados automáticos con respaldo local inmediato, espera de 450 ms y cola serial por cuenta/fecha. La revisión se comprueba dentro de una transacción para no sobrescribir cambios de otro dispositivo.
- Si existe un conflicto, se detienen nuevas escrituras y se ofrece cargar la versión de la cuenta. Antes de descartar el borrador se conserva una copia local de recuperación.
- Realtime recarga cambios remotos cuando no hay cambios locales pendientes. Sin conexión se conserva el respaldo y se puede reintentar; no se presenta un fallo como un guardado en la nube.
- Los borradores locales están separados por usuario. Un invitado no se importa silenciosamente al iniciar sesión: utiliza «Importar plan local de este día».
- Los datos anteriores `mi-plato:FECHA` se pueden migrar sin convertir unidades ni cambiar cantidades. Se muestran como plan anterior hasta elegir A/B. Los originales se conservan.

## Reglas implementadas

### Desayuno y tomas pequeñas

- Desayuno: Nada, Solo café, A o B. A/B pueden incluir también café.
- A inicial: 50 g de pan integral de molde + 100 g de cottage. Se elige el relleno entre los autorizados; la cantidad alternativa mantiene la proteína de los 100 g de cottage, sin ignorar los demás macros que aporta.
- B inicial: un envase de 125 g de yogur griego natural o natural Hacendado + 10 g de chía + 125 g de fresas. Se elige la fruta autorizada y se calcula una cantidad equivalente en carbohidratos a esas fresas. Las cantidades de chía y fruta son editables; el yogur se mantiene en un envase.
- Para controlar las dos raciones diarias, la fruta propuesta para B es una ración del plan. Las cantidades editadas cuentan de forma proporcional; 250 g de fresas cuentan como dos. No se usa esta referencia como equivalencia clínica universal.
- Merienda obligatoria con A/B. Café y leche solo en desayuno.
- Café inicial: 150 ml de leche entera + 50 ml de café solo sin azúcar, guardados como dos ingredientes; se permite cambiar a semidesnatada y editar volúmenes.

### Comida y cena

- Comida: 200 g de verduras, fuente proteica y fuente de carbohidratos.
- Cena: 200 g de verduras y fuente proteica, sin añadir guarnición de cereales/tubérculos. Los carbohidratos propios de verduras, legumbres o lácteos se computan igualmente.
- Carne/pescado: referencia 150–180 g crudos. Se puede introducir un objetivo de proteína del plato; el cálculo descuenta la proteína de los demás ingredientes y calcula la cantidad de la fuente seleccionada. Si se sale de referencia, se avisa.
- Arroz integral: 70 g crudos son peso del alimento, no gramos del nutriente. Otras guarniciones se calculan con los carbohidratos de la ficha: `(70 / 100 × carbohidratos del arroz) / carbohidratos del alimento × 100`.
- Se conserva el estado de cada ficha. No se convierten automáticamente pesos crudos, secos y cocidos.

### Presupuesto y cena

Objetivos iniciales editables: 1.500 kcal, 120 g de proteína, 142,5 g de carbohidratos y 50 g de grasas. Todos los ingredientes aportan sus cuatro valores al plato y al día.

La cena se elige directamente con sus alimentos; no hay propuesta automática ni botón para aplicarla. El panel muestra lo disponible tras desayuno, comida y merienda. Sin objetivo de proteína específico, calcula los gramos necesarios para completar el objetivo diario descontando proteína del resto del día y de los demás ingredientes de la cena. Aplica un máximo de 180 g de producto; en carne/pescado crudo mantiene además el mínimo de referencia de 150 g. Si no alcanza, informa del déficit. Un objetivo de proteína explícito tiene prioridad; editar gramos directamente conserva la cantidad elegida.

«Borrar» vacía una comida, su receta y su objetivo proteico, sin cambiar las demás. El borrado se aplica directamente, sin aviso ni opción Deshacer. Los avisos nutricionales concretos permanecen visibles; toda la ayuda explicativa se concentra en «Tu plato de referencia».

## Catálogo y fuentes

`data/catalogo.json` conserva las fichas existentes y las variantes expresamente autorizadas: **145 alimentos, 17 frutas**. Nunca se importan pendientes de autorización ni otro catálogo.

- Leche entera: ficha de [Central Lechera Asturiana](https://static-centrallecheraasturiana.pro.centrallecheraasturiana.es/uploads/2017/02/leche-brik-entera-1l.pdf): por 100 ml, 63 kcal, 3,1 g P, 4,6 g C y 3,6 g G. Referencia inicial por marca; puede variar.
- Café: [TBCA BRC0060H](https://tbca.net.br/base-dados-en/int_statistical_composition.php?cod_produto=BRC0060H), infusión al 6 % sin azúcar: por 100 g, 6 kcal, 0,4 g P, 1,01 g C y 0,04 g G. Se aproxima densidad a 1 g/ml para el volumen. Esta aproximación está documentada en la ficha y no representa todas las preparaciones.
- Semidesnatada: valores por 100 ml facilitados por la usuaria.
- El resto conserva los valores estimados y las fuentes originales; no se declara verificación individual. Se pueden consultar desde «Alimentos».

El cliente consulta Supabase por grupos; sin configuración, utiliza archivos estáticos por grupo/alimento generados por Astro. Solo muestra ocho resultados por página. No descarga todo el catálogo al abrir la pantalla.

## Estructura y verificación

- `src/components/Planner.jsx`: flujo React y controles.
- `src/lib/engine.js`: recetas, macros, equivalencias, reservas, propuestas y validación.
- `src/lib/usePlan.js`: sesión, recuperación, respaldo, sincronización y conflictos.
- `src/lib/repository.js`: consultas del catálogo y persistencia.
- `src/pages/`: página Astro y fichas estáticas del catálogo.
- `src/styles/planner.css`: diseño adaptable.
- `supabase/`: migración y semilla.
- `tests/planner.test.mjs`: motor y cola de sincronización.
- `tests/ui.test.mjs`: interacciones React en DOM simulado, cambios de cantidades, carga en un segundo navegador simulado y aislamiento de cuentas con repositorio remoto simulado.

Las pruebas locales y la compilación no sustituyen comprobar Auth, migración, RLS y sincronización contra tu proyecto real. Esa verificación está pendiente hasta disponer de su configuración. El navegador integrado no está disponible en esta sesión; la revisión visual real también queda pendiente.

### Tablas proporcionadas, etiquetas y unidades

Las tablas de la usuaria actualizan los mismos IDs de pan, cottage, huevo, yogur entero, chía y las 17 frutas. Se añaden únicamente jamón cocido y serrano, Burgos, semicurado, curado, atún al natural escurrido y yogur griego 0 %. Todas estas medias son provisionales, pendientes de verificación homogénea; no se han contrastado externamente.

La chía guarda 42,1 g de hidratos totales y 34,4 g de fibra por 100 g, pero el cálculo usa 7,7 g de carbohidratos disponibles. Las calorías mantienen el dato proporcionado; no se deducen mediante 4/4/9.

Se ha retirado el editor de etiquetas de marca. Los valores se leen siempre de la ficha del catálogo y las etiquetas personalizadas de planes antiguos se descartan al cargarlos. Las cantidades y los demás ingredientes se conservan.

Referencias Hacendado consultadas el 22/10/2026, con sus fuentes documentadas:

- Yogur griego natural: 129 kcal, 3,9 g P, 3,9 g C y 10,8 g G por 100 g, [TABULA v3.0 (2025), CEU](https://ias.ceu.es/alimento/a-88411700907422/).
- Yogur natural entero: 62 kcal, 3,7 g P, 4,1 g C y 3,4 g G por 100 g, [TABULA v3.0 (2025), CEU](https://ias.ceu.es/alimento/a-88411700907424/).
- Cottage: 104 kcal, 14 g P, 3 g C y 4 g G por 100 g, [BADALI, UMH](https://badali.umh.es/alimento/quesos-cottage/15793/busqueda-rapida).

Estas son referencias publicadas; `verificado:false` se mantiene porque no se ha contrastado el envase actual y hay formulaciones distintas. El resto conserva su estándar. No se usa yogur ligero 2 % como sustituto de 0 %. La receta ahora ofrece únicamente griego natural o natural Hacendado, un envase de 125 g por toma. Al cargar recetas antiguas, se ajustan a 125 g, se eliminan duplicados de yogur y se sustituye la antigua opción griega 0 % por natural Hacendado; esto responde a la nueva indicación expresa de la usuaria. La ficha griega 0 % sigue en el catálogo autorizado, sin formar parte de estas recetas.


Huevo entero: gramos comestibles sin cáscara o unidades con peso editable (inicio orientativo: 50 g/huevo). Pan de molde: gramos o rebanadas con peso editable (inicio orientativo: 25 g/rebanada). Los gramos son la cantidad almacenada; editar el peso por unidad conserva los gramos y recalcula las unidades. Atún: siempre peso escurrido. Cada ingrediente muestra sus cuatro macros; todas las cantidades actualizan los totales de la toma y del día.

Tras actualizar una instalación Supabase existente, aplica la migración 002 y vuelve a ejecutar el seed para actualizar las fichas y dar de alta las siete variantes. No basta con recompilar el frontend: la conexión remota tiene prioridad sobre el catálogo estático.

El día tiene cuatro tomas: desayuno opcional, comida, merienda y cena. Al recuperar planes anteriores se vacía la media mañana y se excluye de todos los cálculos y de la fruta. Se conserva solo una clave vacía de compatibilidad con el RPC existente de Supabase.

Las opciones visibles de relleno del pan son jamón cocido, jamón serrano, cottage, Burgos, semicurado, curado, huevo entero y atún al natural escurrido. El yogur permite entero o 0 %, junto con chía y una de las 17 frutas autorizadas.

### Búsqueda y selección de alimentos

El catálogo permite buscar directamente en todos los grupos, con coincidencias sin distinguir tildes ni mayúsculas. Las categorías filtran los resultados y se muestran ocho alimentos por página. Los grupos completos solo se consultan cuando se inicia una búsqueda global. Cada selector de comida integra búsqueda y resultados en un panel con semántica combobox/listbox, selección visible y datos por 100 g/ml. Las flechas recorren la lista y Enter selecciona. Se cierra al pulsar fuera o Escape, sin cambiar el alimento elegido; Escape devuelve el foco al botón. La búsqueda tiene controles para limpiar, estados de carga y mensajes sin resultados; el diseño se adapta a móvil y respeta movimiento reducido.

### Presentación del planificador

`src/styles/visual.css`, importado desde la página Astro, define el sistema visual común: tarjetas independientes por comida, tipografía y tamaños legibles, controles de al menos 44 px, foco visible, adaptación a móvil y modo de contraste forzado. Respeta la preferencia de movimiento reducido. Las opciones seleccionadas exponen `aria-pressed` y los campos numéricos tienen etiquetas accesibles sin anidar elementos `label`.

### Referencias y ayuda

La interfaz no calcula ni ofrece una cena completa. El motor de exploración de combinaciones queda como función independiente para sus pruebas y posibles usos futuros, sin ejecutarse desde la interfaz. Los cálculos activos de cena solo ajustan la cantidad de la proteína elegida por la usuaria. No se inventan equivalencias de ración para huevos, quesos, legumbres o suplementos; cualquier fuente elegida para completar proteína sigue el tope explícito de 180 g de producto.

La referencia provisional de fruta continúa respecto a los carbohidratos disponibles de 125 g de fresas. El máximo de dos raciones sigue comprobándose localmente y en el RPC. Su explicación, al igual que las reglas de café, cantidades, búsqueda, borrado y cálculo, está únicamente en «Tu plato de referencia».
